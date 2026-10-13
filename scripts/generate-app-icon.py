"""Render a square Q with a split block cursor as the QH app icon."""
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
rect((80,80,944,944), radius=190, fill='#0e0d11')
# Square Q: one open frame and one detached block cursor.
foreground = '#f4f4f5'
shape = [(272,272),(720,272),(720,608),(632,608),(632,360),(360,360),(360,632),(608,632),(608,720),(272,720)]
mark = Image.new('RGBA', im.size)
md = ImageDraw.Draw(mark)
md.polygon([(x*scale,y*scale) for x,y in shape], fill=foreground)
md.rectangle(tuple(v*scale for v in (640,640,752,752)), fill=foreground)
im = Image.alpha_composite(im, mark)
mark.resize((1024,1024),Image.Resampling.LANCZOS).save(out/'qh-mark.png')
vector = '''  <g fill="#f4f4f5">
    <path d="M272 272 H720 V608 H632 V360 H360 V632 H608 V720 H272 Z"/>
    <rect x="640" y="640" width="112" height="112"/>
  </g>
'''
(out/'qh.svg').write_text('''<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <title>QH terminal icon: square Q with split cursor</title>
  <rect x="80" y="80" width="864" height="864" rx="190" fill="#0e0d11"/>
''' + vector + '</svg>\n')
mark_svg = '''<svg xmlns="http://www.w3.org/2000/svg" width="544" height="544" viewBox="240 240 544 544">
  <title>QH square Q with split cursor</title>
''' + vector + '</svg>\n'
(out/'qh-mark.svg').write_text(mark_svg)
(root/'desktop/icons/qh.svg').write_text(mark_svg)
im=im.resize((1024,1024),Image.Resampling.LANCZOS)
im.save(out/'qh.png')
iconset=out/'QH.iconset';iconset.mkdir(exist_ok=True)
for size in (16,32,128,256,512):
 for factor in (1,2):
  suffix='@2x' if factor==2 else ''
  im.resize((size*factor,size*factor),Image.Resampling.LANCZOS).save(iconset/f'icon_{size}x{size}{suffix}.png')
subprocess.run(['iconutil','-c','icns',str(iconset),'-o',str(out/'QH.icns')],check=True)
print(out/'QH.icns')
