"""Render the existing Qentrah vector mark as a macOS app icon."""
from pathlib import Path
from PIL import Image, ImageDraw
import subprocess
root = Path(__file__).resolve().parents[1]
out = root / 'src/assets/icons'
out.mkdir(parents=True, exist_ok=True)
scale = 3
im = Image.new('RGBA', (1024*scale, 1024*scale))
d = ImageDraw.Draw(im)
def rect(box, **kw): d.rounded_rectangle(tuple(int(v*scale) for v in box), **{k: int(v*scale) if k in ('radius','width') else v for k,v in kw.items()})
rect((80,80,944,944), radius=190, fill='#0e0d11', outline='#302d39', width=3)
# SVG viewBox 0 0 64 64. Stroke is centred around the brand's arc.
def point(x,y): return ((210+x*9)*scale, (175+y*9)*scale)
bbox=(*point(4,8),*point(54,58))
d.arc(bbox, 90, 360, fill='#f4f4f5', width=90*scale)
d.rectangle((*point(33,33),*point(47,47)), fill='#f4f4f5')
d.rectangle((*point(48,48),*point(59,59)), fill='#f4f4f5')
# Small terminal prompt, secondary to the Qentrah mark.
d.line([(int(x*scale),int(y*scale)) for x,y in [(410,770),(438,795),(410,820)]], fill='#9cdcfe',width=10*scale)
d.line([(468*scale,820*scale),(529*scale,820*scale)],fill='#9cdcfe',width=10*scale)
im=im.resize((1024,1024),Image.Resampling.LANCZOS)
im.save(out/'qesh.png')
iconset=out/'Qesh.iconset';iconset.mkdir(exist_ok=True)
for size in (16,32,128,256,512):
 for factor in (1,2):
  suffix='@2x' if factor==2 else ''
  im.resize((size*factor,size*factor),Image.Resampling.LANCZOS).save(iconset/f'icon_{size}x{size}{suffix}.png')
subprocess.run(['iconutil','-c','icns',str(iconset),'-o',str(out/'Qesh.icns')],check=True)
print(out/'Qesh.icns')
