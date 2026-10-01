import copy
import contextlib
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('cancel_orphan', Path(__file__).with_name('task-finish-cancel-orphan.py'))
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)


class Store:
    def __init__(self, data): self.data = copy.deepcopy(data)
    def get(self, *args): return copy.deepcopy(self.data)
    def save(self, sid, root, data): self.data = copy.deepcopy(data)
    @contextlib.contextmanager
    def transaction(self):
        before = copy.deepcopy(self.data)
        try: yield
        except Exception:
            self.data = before
            raise


class CancellationTest(unittest.TestCase):
    def setUp(self):
        self.call = {'tool_name': 'apply_patch', 'turn_id': c.TURN, 'paths': [c.TARGET], 'new_paths': [],
            'known_before': {c.TARGET: c.BLOB}, 'snapshot': {c.TARGET: c.BLOB},
            'batch_dispatch': {'outer_call_id': c.OUTER, 'thread_id': c.SESSION,
                'turn_id': c.TURN, 'step_index': 0, 'source_sha256': c.SOURCE_SHA}}
        self.data = {'calls': {c.CALL: self.call, 'other': {'terminal': None}},
                     'files': {c.TARGET: {'edited': True}}, 'unknown': {'other.txt': {'after': 'value'}},
                     'hold': 'unrelated hold', 'attempts': 2, 'status': 'unfinished'}
        self.store = Store(self.data)
        self.gate = SimpleNamespace(repository=lambda root: root, head=lambda root: 'head',
                                   active_owner=lambda *args: False, blob=lambda *args: c.BLOB)
        self.evidence = {'source_digest': 'plan', 'head': 'head', 'call_sha256': c.digest(self.call)}

    def apply(self, expected='plan', reason='User explicitly cancels old patch'):
        with patch.object(c, 'plan', return_value=self.evidence):
            return c.cancel(self.gate, self.store, expected, reason)

    def test_archives_unknown_call_and_preserves_all_other_state(self):
        result = self.apply()
        self.assertEqual(result['completion'], 'not-evaluated')
        state = self.store.data
        self.assertNotIn(c.CALL, state['calls'])
        self.assertEqual(state['cancelled_calls'][c.CALL]['original_call'], self.call)
        self.assertEqual(state['cancelled_calls'][c.CALL]['original_outcome'], 'unknown')
        self.assertNotIn('terminal', state['cancelled_calls'][c.CALL]['original_call'])
        for key in ('files', 'unknown', 'hold', 'attempts', 'status'):
            self.assertEqual(state[key], self.data[key])
        self.assertEqual(state['calls'], {'other': {'terminal': None}})
        self.assertNotIn('finished_calls', state)

    def test_stale_plan_and_missing_authorization_cannot_mutate(self):
        for digest, reason in [('wrong', 'cancel'), ('plan', ''), (None, 'cancel')]:
            with self.subTest(digest=digest), self.assertRaises(ValueError): self.apply(digest, reason)
            self.assertEqual(self.store.data, self.data)

    def test_changed_file_or_head_or_owner_cannot_cancel(self):
        for key, function in [('blob', lambda *args: 'changed'), ('head', lambda root: 'other'),
                              ('active_owner', lambda *args: True)]:
            old = getattr(self.gate, key)
            setattr(self.gate, key, function)
            with self.subTest(key=key), self.assertRaises(ValueError): self.apply()
            self.assertEqual(self.store.data, self.data)
            setattr(self.gate, key, old)

    def test_other_or_completed_call_rejected(self):
        for key, value in [('terminal', {'status': 'completed'}), ('paths', ['other.py']),
                           ('turn_id', 'other-turn'), ('new_paths', ['new.py'])]:
            changed = dict(self.call, **{key: value})
            with self.subTest(key=key), self.assertRaises(ValueError): c.validate_call(changed)

    def test_changed_record_after_plan_is_rejected(self):
        self.store.data['calls'][c.CALL]['extra'] = 'changed'
        before = copy.deepcopy(self.store.data)
        with self.assertRaises(ValueError): self.apply()
        self.assertEqual(self.store.data, before)

    def test_coverage_error_cannot_cancel(self):
        self.store.data['coverage_problem'] = 'unobserved changes'
        with self.assertRaises(ValueError): self.apply()
        self.assertIn(c.CALL, self.store.data['calls'])


if __name__ == '__main__': unittest.main()
