import { Component, ElementRef, ViewChild, AfterViewInit } from '@angular/core';

declare var cv: any; // Declare OpenCV.js

@Component({
  selector: 'app-image-canvas',
  standalone: true,
  templateUrl: './image-canvas.component.html',
  styleUrls: ['./image-canvas.component.css']
})
export class ImageCanvasComponent implements AfterViewInit {
  @ViewChild('imageCanvas', { static: true }) canvas!: ElementRef<HTMLCanvasElement>;
  private imageMat!: any;
  private isOpenCvLoaded = false;

  ngAfterViewInit() {
    this.loadOpenCv();
  }

  loadOpenCv() {
    const interval = setInterval(() => {
      if (cv && cv.Mat) {
        this.isOpenCvLoaded = true;
        console.log('OpenCV.js is loaded');
        clearInterval(interval);
      }
    }, 100); // Check every 100 milliseconds
  }

  loadImage(event: Event) {
    if (!this.isOpenCvLoaded) {
      console.error('OpenCV.js is not loaded yet');
      return;
    }
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        const imgElement = document.createElement('img');
        imgElement.src = e.target.result;
        imgElement.onload = () => {
          const src = cv.imread(imgElement);
          this.imageMat = src.clone(); // Store the image matrix
          cv.imshow(this.canvas.nativeElement, src);
          src.delete(); // Clean up the temporary matrix
        };
      };
      reader.readAsDataURL(input.files[0]);
    }
  }

  cutImage(x: number, y: number, width: number, height: number) {
    if (!this.imageMat) {
      console.error('Image is not loaded');
      return;
    }
    const cutRect = this.imageMat.roi(new cv.Rect(x, y, width, height));
    cv.imshow(this.canvas.nativeElement, cutRect);
    cutRect.delete(); // Clean up the matrix after displaying
  }


  rotateImage(angle: number) {
    if (!this.imageMat) {
      console.error('Image is not loaded');
      return;
    }
    const center = new cv.Point(this.imageMat.cols / 2, this.imageMat.rows / 2);
    const M = cv.getRotationMatrix2D(center, angle, 1);
    const rotated = new cv.Mat();
    cv.warpAffine(this.imageMat, rotated, M, new cv.Size(this.imageMat.cols, this.imageMat.rows), cv.INTER_CUBIC, cv.BORDER_CONSTANT, new cv.Scalar());
    cv.imshow(this.canvas.nativeElement, rotated);
    rotated.delete();
    M.delete();
  }

  deskewImageAutomatically() {
    if (!this.isOpenCvLoaded || !this.imageMat) {
      console.error('OpenCV.js is not loaded or image is not loaded');
      return;
    }
    const gray = new cv.Mat();
    cv.cvtColor(this.imageMat, gray, cv.COLOR_RGBA2GRAY, 0);

    const edges = new cv.Mat();
    cv.Canny(gray, edges, 50, 150);

    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let maxRect = null;
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const rect = cv.minAreaRect(contour);
      if (!maxRect || rect.size.width * rect.size.height > maxRect.size.width * maxRect.size.height) {
        maxRect = rect;
      }
    }

    if (maxRect) {
      let angle = maxRect.angle;
      if (angle < -45) angle += 90;
      this.rotateImage(-angle);
    } else {
      console.warn('No skew detected');
    }

    gray.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();
  }

  applyEffect(effect: 'darken' | 'lighten') {
    if (!this.imageMat) {
      console.error('Image is not loaded');
      return;
    }
    const modifiedMat = this.imageMat.clone();
    for (let row = 0; row < modifiedMat.rows; row++) {
      for (let col = 0; col < modifiedMat.cols; col++) {
        const pixel = modifiedMat.ucharPtr(row, col);
        if (effect === 'darken') {
          pixel[0] = Math.max(0, pixel[0] * 0.7);   // Red channel
          pixel[1] = Math.max(0, pixel[1] * 0.7);   // Green channel
          pixel[2] = Math.max(0, pixel[2] * 0.7);   // Blue channel
        } else if (effect === 'lighten') {
          pixel[0] = Math.min(255, pixel[0] * 1.3); // Red channel
          pixel[1] = Math.min(255, pixel[1] * 1.3); // Green channel
          pixel[2] = Math.min(255, pixel[2] * 1.3); // Blue channel
        }
      }
    }
    cv.imshow(this.canvas.nativeElement, modifiedMat);
    modifiedMat.delete();
  }
}
