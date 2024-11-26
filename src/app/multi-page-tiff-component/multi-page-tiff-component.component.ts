import { Component } from '@angular/core';
import * as UTIF from 'utif';

@Component({
  standalone: true,
  selector: 'app-multi-page-tiff',
  template: `
    <div>
      <input type="file" (change)="loadTiff($event)" />
    </div>
    <div id="tiff-pages">
      <!-- Dynamic canvases will be created here -->
    </div>
  `,
  styles: [
    `
      #tiff-pages canvas {
        margin-bottom: 20px;
        border: 1px solid black;
      }
    `
  ]
})
export class MultiPageTiffComponent {
  loadTiff(event: Event) {
    const input = event.target as HTMLInputElement;

    if (input.files && input.files[0]) {
      const file = input.files[0];

      const reader = new FileReader();
      reader.onload = () => {
        const buffer = reader.result as ArrayBuffer;

        // Decode all pages from the TIFF
        const tiffPages = UTIF.decode(buffer);

        // Process each page
        tiffPages.forEach(page => {
          UTIF.decodeImage(buffer, page); // Decode the page
          const rgba = UTIF.toRGBA8(page); // Convert to RGBA

          // Create a canvas for this page
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d')!;

          // Set canvas dimensions
          canvas.width = page.width;
          canvas.height = page.height;

          // Create ImageData and put it on the canvas
          const imageData = new ImageData(new Uint8ClampedArray(rgba), page.width, page.height);
          ctx.putImageData(imageData, 0, 0);

          // Append the canvas to the DOM
          document.getElementById('tiff-pages')!.appendChild(canvas);
        });
      };

      reader.readAsArrayBuffer(file); // Read the file as ArrayBuffer
    }
  }
}
