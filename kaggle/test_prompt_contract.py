import ast
import json
import unittest
from pathlib import Path
from prompt_contract import pack_prompt, normalize_category, normalize_manifest, invariant_prompt, category_dimensions, FIELDS
from outfit_parser import (worn_photo_evidence, labels_for, cutout_for, OutfitParserError,
                           _preserve_occlusions, _repair_occlusion_pixels,
                           _trim_footwear_stems)
import numpy as np
from PIL import Image

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
    def test_jacket_invariant_forbids_mirroring_invented_pockets_and_neck_support(self):
        prompt=invariant_prompt('jacket')
        self.assertIn('never mirror the reference',prompt)
        self.assertIn('Do not add pockets',prompt)
        self.assertIn('truly empty garment opening',prompt)
        self.assertIn('never place a white, grey or skin-toned neck',prompt)
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
        notebook=json.loads((root/'clothmatics_ghost_v9_4.ipynb').read_text())
        source=''.join(notebook['cells'][0]['source'])
        tree=ast.parse(source)
        strings={node.targets[0].id:ast.literal_eval(node.value) for node in tree.body if isinstance(node,ast.Assign) and isinstance(node.targets[0],ast.Name) and node.targets[0].id in ('WARM_SERVER_CODE','PROMPT_CONTRACT_CODE','OUTFIT_PARSER_CODE')}
        self.assertEqual(len(strings),3)
        for code in strings.values():ast.parse(code)
        self.assertNotIn('sanitize_diffusion_prompt',strings['WARM_SERVER_CODE'])
        self.assertNotIn('truncated_tail',strings['WARM_SERVER_CODE'])
        self.assertIn('asyncio.to_thread(render_request',strings['WARM_SERVER_CODE'])
        self.assertIn("@app.post('/outfit')",strings['WARM_SERVER_CODE'])
        self.assertIn("@app.post('/full-look')",strings['WARM_SERVER_CODE'])
        self.assertIn('image=conditioned',strings['WARM_SERVER_CODE'])
        self.assertIn('FULL_LOOK_WIDTH = 832',strings['WARM_SERVER_CODE'])
        self.assertIn('MODEL_REVISION = "584abc1e1d260e23c0fc627c5217a09b2b461046"',strings['OUTFIT_PARSER_CODE'])
        self.assertIn('PARSER_VERSION = "3"',strings['OUTFIT_PARSER_CODE'])
        self.assertIn('post_process_semantic_segmentation(outputs, target_sizes=target)',strings['OUTFIT_PARSER_CODE'])
        self.assertNotIn('post_process_semantic_segmentation(logits, target_sizes=target)',strings['OUTFIT_PARSER_CODE'])
    def test_worn_detection_requires_person_and_garment_pixels(self):
        labels=np.zeros((100,100),dtype=np.uint8)
        labels[10:70,20:80]=4
        self.assertFalse(worn_photo_evidence(labels)['worn'])
        labels[20:50,5:20]=14
        self.assertTrue(worn_photo_evidence(labels)['worn'])
        sparse=np.zeros((100,100),dtype=np.uint8)
        sparse[10:40,10:40]=4;sparse[5:13,5:13]=11
        self.assertTrue(worn_photo_evidence(sparse)['worn'])
    def test_semantic_cutout_removes_skin_and_background_rectangle(self):
        photo=Image.new('RGB',(100,100),(8,180,30))
        labels=np.zeros((100,100),dtype=np.uint8)
        labels[20:70,20:80]=4
        labels[30:60,5:20]=14
        cutout=cutout_for(photo,labels,{'index':0,'parserClass':'shirt','boundingBox':[100,0,800,900]})
        with Image.open(__import__('io').BytesIO(cutout.png)) as image:
            alpha=np.asarray(image.getchannel('A'))
            self.assertGreater(int((alpha==0).sum()),0)
            self.assertGreater(int((alpha>0).sum()),0)
        self.assertEqual(cutout.labels,(4,))
        self.assertEqual(labels_for('footwear'),(9,10))
        with self.assertRaises(OutfitParserError):labels_for('bag')

    def test_top_preserves_arm_pixels_only_when_they_occlude_the_garment(self):
        labels=np.zeros((100,100),dtype=np.uint8)
        mask=np.zeros_like(labels,dtype=bool)
        mask[20:80,20:80]=True
        mask[40:60,42:58]=False
        mask[20:40,45:55]=False
        labels[mask]=4
        labels[40:60,42:58]=14
        labels[20:40,45:55]=11
        labels[40:60,5:15]=14
        region=np.ones_like(mask,dtype=bool)
        repaired,occlusions=_preserve_occlusions(mask,labels,region,'shirt')
        self.assertTrue(repaired[50,50])
        self.assertFalse(repaired[30,50])
        self.assertFalse(repaired[50,10])
        self.assertEqual(int(occlusions.sum()),16*20)

    def test_lower_garment_keeps_upper_occluders_without_filling_crotch(self):
        labels=np.zeros((120,100),dtype=np.uint8)
        mask=np.zeros_like(labels,dtype=bool)
        mask[20:50,20:80]=True
        mask[50:110,20:43]=True
        mask[50:110,57:80]=True
        mask[25:48,28:40]=False
        labels[mask]=6
        labels[25:48,28:40]=14
        labels[28:48,60:72]=4
        region=np.ones_like(mask,dtype=bool)
        repaired,occlusions=_preserve_occlusions(mask,labels,region,'trousers')
        self.assertTrue(repaired[35,34])
        self.assertTrue(repaired[35,66])
        self.assertFalse(repaired[75,50])
        self.assertGreater(int(occlusions.sum()),0)

    def test_occlusion_repair_replaces_skin_only_with_observed_garment_pixels(self):
        source=np.full((60,80,3),(12,18,24),dtype=np.uint8)
        clean=np.zeros((60,80),dtype=bool)
        clean[10:55,10:70]=True
        occlusion=np.zeros_like(clean)
        occlusion[18:35,20:34]=True
        clean[occlusion]=False
        source[occlusion]=(190,120,95)
        repaired,count=_repair_occlusion_pixels(source,clean,occlusion)
        self.assertEqual(count,int(occlusion.sum()))
        self.assertTrue(np.all(repaired[occlusion]==(12,18,24)))
        self.assertTrue(np.all(repaired[0,0]==source[0,0]))

    def test_footwear_trims_narrow_sock_stems_and_keeps_shoe_bodies(self):
        mask=np.zeros((80,100),dtype=bool)
        mask[10:26,20:26]=True
        mask[24:55,10:45]=True
        mask[12:28,72:78]=True
        mask[26:57,55:90]=True
        trimmed,count=_trim_footwear_stems(mask)
        self.assertFalse(trimmed[12,22])
        self.assertFalse(trimmed[14,74])
        self.assertTrue(trimmed[40,25])
        self.assertTrue(trimmed[42,70])
        self.assertGreater(count,0)

if __name__=='__main__':unittest.main()
