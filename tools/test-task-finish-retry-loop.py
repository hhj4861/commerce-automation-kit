"""Exercise real Stop/UserPromptSubmit transitions against an isolated SQLite store."""
import ast
import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import unittest

DIRECTORY = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('repair', DIRECTORY / 'task-finish-retry-loop.py')
repair = importlib.util.module_from_spec(spec)
spec.loader.exec_module(repair)
GATE = Path(os.environ.get('TASK_FINISH_GATE', Path.home() / '.codex/hooks/task-finish/gate.py'))
BASE = GATE.read_text()
MARKER = '# Identical failures keep their bounded retry budget across turns.'
# Validate both the candidate before installation and the installed source afterwards.
PATCHED = BASE if MARKER in BASE else repair.patch(BASE)
sys.path.insert(0, str(GATE.parent))


class RetryLoopTest(unittest.TestCase):
    def setUp(self):
        self.g = {'__name__': 'isolated_gate', '__file__': str(GATE)}
        exec(compile(PATCHED, str(GATE), 'exec'), self.g)
        self.directory = tempfile.TemporaryDirectory(prefix='retry-loop-test-')
        self.addCleanup(self.directory.cleanup)
        self.g['head'] = lambda root: 'a' * 40
        self.g['branch'] = lambda root: 'task-branch'
        self.g['repository'] = lambda cwd: '/fixture'
        self.store = self.g['Store'](Path(self.directory.name))
        self.addCleanup(self.store.db.close)
        self.g['reconcile_calls'] = lambda store, sid, root: store.get(sid, root)
        self.sid, self.root = 'fixture-session', '/fixture'
        self.pending = {'lost-call': {'tool_name': 'apply_patch', 'turn_id': 'old-turn', 'terminal': False}}
        with self.store.transaction():
            data = self.store.get(self.sid, self.root)
            data['calls'] = self.pending
            self.store.save(self.sid, self.root, data)

    def data(self):
        return self.store.get(self.sid, self.root)

    def event(self, name, **extra):
        return self.g['handle']({'hook_event_name': name, 'session_id': self.sid,
                                 'cwd': self.root, 'turn_id': 'current-turn', **extra}, self.store)

    def change(self, **values):
        with self.store.transaction():
            data = self.data()
            data.update(values)
            self.store.save(self.sid, self.root, data)

    def test_real_prompts_do_not_restart_identical_failure_forever(self):
        for attempt in range(1, 6):
            self.event('UserPromptSubmit', prompt='계속해줘')
            result = self.event('Stop')
            self.assertEqual(self.data()['attempts'], attempt)
            self.assertEqual(self.data()['status'], 'unfinished')
            self.assertEqual(self.data()['calls'], self.pending)
            self.assertFalse(self.store.completed(self.sid, self.root, 'lost-call'))
            if attempt < 3:
                self.assertEqual(result['decision'], 'block')
            else:
                self.assertIs(result['continue'], False)
                self.assertIn('미완료', result['systemMessage'])

    def test_changed_failure_gets_new_budget(self):
        for _ in range(3):
            self.event('Stop')
        self.change(calls={'new-terminal-call': {'terminal': True}})
        self.assertEqual(self.event('Stop')['decision'], 'block')
        self.assertEqual(self.data()['attempts'], 1)
        self.assertEqual(self.data()['calls'], {'new-terminal-call': {'terminal': True}})

    def test_actual_success_resets_budget(self):
        self.event('Stop')
        self.change(calls={})
        self.assertEqual(self.event('Stop'), {})
        self.assertEqual(self.data()['attempts'], 0)
        self.assertEqual(self.data()['status'], 'no-change')
        self.change(calls=self.pending)
        self.assertEqual(self.event('Stop')['decision'], 'block')
        self.assertEqual(self.data()['attempts'], 1)

    def test_automatic_prompt_preserves_hold_user_can_resume(self):
        self.change(hold='missing host evidence')
        self.event('UserPromptSubmit', prompt='<hook_prompt hook_run_id="stop:9">[codex-task-finish] retry</hook_prompt>')
        self.assertEqual(self.data()['hold'], 'missing host evidence')
        self.assertIs(self.event('Stop')['continue'], False)
        self.event('UserPromptSubmit', prompt='다시 확인해줘')
        self.assertNotIn('hold', self.data())
        self.assertEqual(self.data()['calls'], self.pending)

    def test_commit_and_remote_checks_still_run_and_preserve_files(self):
        files = {'source.py': {'after': 'pending-blob'}}
        self.change(calls={}, files=files)
        checks = []
        self.g['check'] = lambda data, root: checks.append(root) or ['upstream push missing']
        for _ in range(4):
            self.event('UserPromptSubmit', prompt='계속')
            result = self.event('Stop')
        self.assertEqual(len(checks), 4)
        self.assertIs(result['continue'], False)
        self.assertEqual(self.data()['files'], files)
        self.assertEqual(self.data()['status'], 'unfinished')

    def test_patch_changes_only_prompt_retry_reset(self):
        unpatched = PATCHED.replace(
            "                # Identical failures keep their bounded retry budget across turns.\n"
            "                # stop_event resets it when evidence changes or checks succeed.",
            "                data['attempts'] = 0", 1)
        self.assertEqual(repair.patch(unpatched), PATCHED)
        before = {n.name: ast.dump(n) for n in ast.parse(unpatched).body if isinstance(n, (ast.FunctionDef, ast.ClassDef))}
        after = {n.name: ast.dump(n) for n in ast.parse(PATCHED).body if isinstance(n, (ast.FunctionDef, ast.ClassDef))}
        self.assertEqual([name for name in before if before[name] != after[name]], ['handle'])
        with self.assertRaises(ValueError):
            repair.patch(PATCHED)


if __name__ == '__main__':
    unittest.main()
