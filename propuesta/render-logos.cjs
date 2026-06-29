const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
function render(svgPath, pngPath, width) {
  const svg = fs.readFileSync(svgPath, 'utf8');
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: width }, background: 'rgba(255,255,255,0)' });
  const png = r.render();
  fs.writeFileSync(pngPath, png.asPng());
  console.log(pngPath, '->', png.width + 'x' + png.height);
}
render('assets/analysys-logo.svg', 'assets/analysys-logo.png', 900);
render('assets/maxirent-logo.svg', 'assets/maxirent-logo.png', 900);
