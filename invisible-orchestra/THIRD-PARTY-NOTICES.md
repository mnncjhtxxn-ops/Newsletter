# Third-party notices

The built file `dist/invisible-orchestra.html` bundles the following software.

## three.js

Copyright © 2010-2025 three.js authors. Licensed under the MIT License.
https://github.com/mrdoob/three.js/blob/dev/LICENSE

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

esbuild (MIT) is used at build time only and is not part of the shipped file.
No fonts, images, audio or video assets are bundled: every sprite is drawn procedurally and text uses the system font stack.

## 3D models (geometry only)

Three supplied models are embedded as decimated, quantised geometry (no textures or materials). Full details, changes made and licence status are in `assets/manifest.json`.

All three were sourced on Sketchfab; public and commercial use was confirmed by Adam Pollock on 27 September 2026.

| Asset | Creator | Licence | Status |
|---|---|---|---|
| Free Concept Car 038 | Unity Fan | CC0 | cleared |
| Timber Frame House | Razny (sketchfab.com/razniak1910) | Sketchfab Standard | cleared |
| Korean Bakery | Bjarne Stokhof | CC BY 4.0 | cleared; attribution required and shown in the staff panel |

**Required attribution (CC BY 4.0):** "Korean Bakery" (https://skfb.ly/orTHn) by Bjarne Stokhof is licensed under Creative Commons Attribution (http://creativecommons.org/licenses/by/4.0/). The geometry was decimated and quantised for this exhibit; no textures are used.
