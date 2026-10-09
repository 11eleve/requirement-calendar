from pathlib import Path
import importlib.util
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('build', ROOT / 'scripts/build.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

class BuildTests(unittest.TestCase):
    def test_round_01_portable_build_contains_all_app_modules(self):
        first = builder.build()
        self.assertEqual(first, builder.build())
        self.assertEqual(first, (ROOT / 'index.html').read_text())
        self.assertTrue(first.startswith('<!doctype html>'))
        self.assertNotIn('<script src=', first)
        self.assertNotIn('<link rel="stylesheet"', first)
        self.assertNotIn('window.openai', first)
        for source in ['model.js', 'planning.js', 'workbook.js', 'storage.js', 'icons.js', 'site-icons.js', 'disclosure.js', 'startup.js', 'app.js']:
            self.assertIn((ROOT / 'src' / source).read_text().strip(), first)
        ids = re.findall(r'\bid="([^"]+)"', first)
        self.assertEqual(len(ids), len(set(ids)))
        for queried in re.findall(r"get\('([^']+)'\)", (ROOT / 'src/app.js').read_text()):
            self.assertIn(queried, ids)

if __name__ == '__main__':
    unittest.main()
