import unittest

import render
import todo


def sample():
    return [
        {"text": "Buy milk", "done": False},
        {"text": "Call the plumber", "done": False},
        {"text": "Water the plants", "done": False},
    ]


class TodoTests(unittest.TestCase):
    def test_add_appends_and_reports_number(self):
        items = []
        self.assertEqual(todo.add(items, "Buy milk"), "added #1: Buy milk")
        self.assertEqual(items, [{"text": "Buy milk", "done": False}])

    def test_done_marks_the_numbered_item(self):
        items = sample()
        self.assertEqual(todo.done(items, 1), "done #1: Buy milk")
        self.assertTrue(items[0]["done"])
        self.assertFalse(items[1]["done"])

    def test_list_numbers_from_one_and_counts(self):
        items = sample()
        items[1]["done"] = True
        expected = "\n".join(
            [
                "1. [ ] Buy milk",
                "2. [x] Call the plumber",
                "3. [ ] Water the plants",
                "2 open, 1 done",
            ]
        )
        self.assertEqual(render.list_items(items), expected)

    def test_list_empty(self):
        self.assertEqual(render.list_items([]), "nothing to do")


if __name__ == "__main__":
    unittest.main()
