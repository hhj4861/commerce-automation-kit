import copy
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('update', HERE / 'task-finish-hook-continuation.py')
update = importlib.util.module_from_spec(spec)
spec.loader.exec_module(update)
gate = Path(os.environ.get('TASK_FINISH_TEST_GATE', Path.home() / '.codex/hooks/task-finish/gate.py'))
ns = {'__name__': 'candidate', '__file__': str(gate)}
exec(compile(update.patch(gate.read_text()), str(gate), 'exec'), ns)


class Continuation(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = self.temp.name
        self.store = ns['Store'](Path(self.root) / 'state')
        self.addCleanup(self.store.db.close)
        self.data = {'version': 1, 'base': 'head', 'branch': 'feature', 'files': {},
                     'unknown': {}, 'calls': {'pending': {'paths': []}}, 'status': 'unfinished',
                     'hold': 'restart interrupted; no terminal evidence', 'attempts': 2}
        with self.store.transaction():
            self.store.save('session', self.root, copy.deepcopy(self.data))
        mocks = {'repository': lambda cwd: self.root, 'branch': lambda root: 'feature',
                 'head': lambda root: 'head'}
        self.patcher = patch.dict(ns, mocks)
        self.patcher.start()
        self.addCleanup(self.patcher.stop)

    def submit(self, prompt, **extra):
        ns['handle']({'hook_event_name': 'UserPromptSubmit', 'session_id': 'session',
                      'cwd': str(self.root), 'prompt': prompt, **extra}, self.store)
        return self.store.get('session', self.root)

    def test_wrapped_hook_preserves_hold_attempts_and_evidence(self):
        state = self.submit('<hook_prompt hook_run_id="stop:9:/home/me/.codex/hooks.json">[codex-task-finish] retry\n</hook_prompt>')
        for key in ('hold', 'attempts', 'calls', 'files', 'unknown', 'status'):
            self.assertEqual(state[key], self.data[key])

    def test_plain_and_flagged_hooks(self):
        for prompt, extra in [('[codex-task-finish] retry', {}), ('opaque', {'stop_hook_active': True})]:
            self.assertEqual(self.submit(prompt, **extra)['hold'], self.data['hold'])

    def test_real_user_resumes_without_erasing_pending_call(self):
        state = self.submit('hook 오류를 확인해서 수정해줘')
        self.assertNotIn('hold', state)
        self.assertEqual(state['attempts'], 0)
        self.assertEqual(state['calls'], self.data['calls'])

    def test_unrelated_or_embedded_wrappers_are_user_input(self):
        for prompt in ['<hook_prompt>different plugin</hook_prompt>',
                       '수정해줘 <hook_prompt>[codex-task-finish] x</hook_prompt>',
                       '<hook_prompt>[codex-task-finish] x</hook_prompt> continue',
                       '<hook_prompt>[codex-task-finish] x', None, {'text': '[codex-task-finish]'}]:
            self.assertFalse(ns['task_finish_continuation']({'prompt': prompt}))

    def test_hold_stops_unfinished_not_success(self):
        with patch.dict(ns, {'reconcile_calls': lambda *a: copy.deepcopy(self.data)}):
            result = ns['stop_event'](self.store, 'session', self.root, {})
        self.assertFalse(result['continue'])
        self.assertIn('미완료', result['stopReason'])
        self.assertEqual(self.store.get('session', self.root)['calls'], self.data['calls'])

    def test_three_wrapped_retries_stop_without_completing_pending_call(self):
        self.submit('resume')
        with patch.dict(ns, {'reconcile_calls': lambda *a: self.store.get('session', self.root)}):
            for i in range(3):
                result = ns['stop_event'](self.store, 'session', self.root, {'turn_id': str(i)})
                if i < 2:
                    self.assertEqual(result['decision'], 'block')
                    self.submit('<hook_prompt hook_run_id="stop:9:x">' + result['reason'] + '</hook_prompt>')
                else:
                    self.assertFalse(result['continue'])
                    self.assertNotIn('decision', result)
        state = self.store.get('session', self.root)
        self.assertEqual(state['status'], 'unfinished')
        self.assertEqual(state['calls'], self.data['calls'])
        self.assertEqual(state['attempts'], 3)

    def test_changed_gate_refuses_install(self):
        with self.assertRaises(ValueError):
            update.patch(gate.read_text() + '\n')


if __name__ == '__main__':
    unittest.main()
