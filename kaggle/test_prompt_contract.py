import ast
import json
import unittest
from pathlib import Path
from prompt_contract import pack_prompt, normalize_category, normalize_manifest, invariant_prompt, category_dimensions, FIELDS

class PiecesTokenizer:
    """Deterministic short pieces exercise budgeting, not a model accuracy test."""
    def encode(self, text, **kwargs):
        return [text[i:i+4] for i in range(0,len(text),4)]
    def decode(self, ids, **kwargs):
        return ''.join(ids)

class PromptTests(unittest.TestCase):
    def test_bottoms_never_receive_upper_body_shape(self):
        for category in ('trousers','shorts','trackpants','cargo'):
            prompt=invariant_prompt(category)
            self.assertIn('Lower garment only',prompt)
            self.assertNotIn('filled chest',prompt)
            self.assertNotIn('supported shoulders',prompt)
            self.assertIn('two separate leg',prompt)
    def test_top_dimensions_stay_stable_while_bottoms_follow_source_shape(self):
        self.assertEqual(category_dimensions('shirt',(500,900),'high'),(768,1024))
        self.assertEqual(category_dimensions('tshirt',(1200,800),'standard'),(768,1024))
        self.assertEqual(category_dimensions('trousers',(600,1000),'high'),(608,1024))
        self.assertEqual(category_dimensions('shorts',(1000,900),'high'),(992,896))
    def test_unknown_category_fails(self):
        for category in ('garment','unknown','bag',''):
            with self.assertRaises(ValueError): normalize_category(category)
        self.assertEqual(normalize_category('sweatshirt'),'tshirt')
        self.assertEqual(normalize_category('joggers'),'trackpants')
    def test_complete_manifest_survives_budget_without_losing_rules(self):
        manifest={'category':'trousers',**{key:(label+' visible ') * 80 for key,label,_,_ in FIELDS}}
        prompt,report=pack_prompt('trousers',manifest,PiecesTokenizer())
        self.assertLessEqual(report['prompt_tokens'],460)
        self.assertTrue(prompt.startswith(invariant_prompt('trousers')))
        self.assertIn('No visible mannequin',prompt)
        for key,label,_,_ in FIELDS:
            if key != 'sleeveType': self.assertIn(label+':',prompt)
        self.assertTrue(report['truncated_fields'])
    def test_category_and_field_type_must_match(self):
        for manifest in ({'category':'shirt'},{'category':'trousers','colorAndFinish':4},{}):
            with self.assertRaises(ValueError):normalize_manifest('trousers',manifest)
    def test_observed_hem_and_color_are_not_rewritten(self):
        manifest={'category':'shirt','colorAndFinish':'Taupe #827C71','surfaceTextureAndWeave':'Coarse slub','garmentLengthAndHem':'Straight camp shirt hem'}
        prompt,_=pack_prompt('shirt',manifest,PiecesTokenizer())
        self.assertIn('Taupe #827C71',prompt)
        self.assertIn('Straight camp shirt hem',prompt)
        self.assertNotIn('curved shirt-tail',prompt)
    def test_multicolor_samples_survive_or_explicitly_fail_context(self):
        palette=[{'role':role,'region':region,'hex':color} for role,region,color in [('base','fabric','#34404A'),('print','stripe','#C6BBAA'),('embroidery','border','#D19C23')]]
        for category in ('shirt','saree','traditional_set','skirt','jumpsuit','leggings'):
            manifest={'category':category,'palette':palette,'colorAndFinish':'warm muted tones','surfaceTextureAndWeave':'woven'}
            prompt,report=pack_prompt(category,manifest,PiecesTokenizer())
            for color in palette:self.assertIn(color['hex'],prompt)
            self.assertLessEqual(report['prompt_tokens'],460)
        crowded={**manifest,'palette':[{'role':'print','region':'very long location on garment with full description','hex':'#123456'}]*12}
        with self.assertRaisesRegex(ValueError,'silently truncated'):pack_prompt('leggings',crowded,PiecesTokenizer())
    def test_palette_rejects_invented_roles_and_codes(self):
        for palette in ([{'role':'background','hex':'#FFFFFF'}],[{'role':'base','hex':'grey'}],['#FFFFFF'],[{}]*13):
            with self.assertRaises(ValueError):normalize_manifest('shirt',{'category':'shirt','palette':palette,'colorAndFinish':'grey','surfaceTextureAndWeave':'woven'})
    def test_generated_notebook_contains_compilable_server_and_contract(self):
        root=Path(__file__).parent
        notebook=json.loads((root/'clothmatics_ghost_v9_2.ipynb').read_text())
        source=''.join(notebook['cells'][0]['source'])
        tree=ast.parse(source)
        strings={node.targets[0].id:ast.literal_eval(node.value) for node in tree.body if isinstance(node,ast.Assign) and isinstance(node.targets[0],ast.Name) and node.targets[0].id in ('WARM_SERVER_CODE','PROMPT_CONTRACT_CODE')}
        self.assertEqual(len(strings),2)
        for code in strings.values():ast.parse(code)
        self.assertNotIn('sanitize_diffusion_prompt',strings['WARM_SERVER_CODE'])
        self.assertNotIn('truncated_tail',strings['WARM_SERVER_CODE'])
        self.assertIn('asyncio.to_thread(render_request',strings['WARM_SERVER_CODE'])

if __name__=='__main__':unittest.main()
