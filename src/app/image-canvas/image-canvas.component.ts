import { Component, ElementRef, ViewChild, AfterViewInit, HostListener } from '@angular/core';

declare var cv: any; // Declare OpenCV.js

@Component({
  selector: 'app-image-canvas',
  standalone: true,
  templateUrl: './image-canvas.component.html',
  styleUrls: ['./image-canvas.component.css']
})
export class ImageCanvasComponent implements AfterViewInit {
  @ViewChild('imageCanvas', { static: true }) canvas!: ElementRef<HTMLCanvasElement>;
  private ctx!: CanvasRenderingContext2D;
  private imageMat!: any;
  private isOpenCvLoaded = false;
  private historyStack: any[] = []; // Array to keep track of image states

  private isSelecting = false;
  private selectionStart = { x: 0, y: 0 };
  private selectionEnd = { x: 0, y: 0 };
  public isSelectionMade = false; // Flag to enable/disable the button

  ngAfterViewInit() {
    this.ctx = this.canvas.nativeElement.getContext('2d')!;
    this.loadOpenCv();
  }

  loadOpenCv() {
    const interval = setInterval(() => {
      if (cv && cv.Mat) {
        this.isOpenCvLoaded = true;
        console.log('OpenCV.js is loaded');
        clearInterval(interval);
      }
    }, 100);
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
          this.saveToHistory(this.imageMat); // Save initial state
          cv.imshow(this.canvas.nativeElement, src);
          src.delete();
        };
      };
      reader.readAsDataURL(input.files[0]);
    }
  }

  saveToHistory(mat: any) {
    this.historyStack.push(mat.clone());
    if (this.historyStack.length > 20) {
      this.historyStack.shift(); // Limit the history to last 20 states
    }
  }

  revertToPreviousState() {
    if (this.historyStack.length > 1) {
      this.historyStack.pop();
      const previousMat = this.historyStack[this.historyStack.length - 1];
      this.imageMat = previousMat.clone();
      cv.imshow(this.canvas.nativeElement, this.imageMat);
    } else {
      console.warn('No previous state available');
    }
  }


  @HostListener('mousedown', ['$event'])
  startSelection(event: MouseEvent) {
    this.isSelecting = true;
    this.isSelectionMade = false; // Reset the selection made flag
    const rect = this.canvas.nativeElement.getBoundingClientRect();
    this.selectionStart.x = event.clientX - rect.left;
    this.selectionStart.y = event.clientY - rect.top;
  }

  @HostListener('mousemove', ['$event'])
  updateSelection(event: MouseEvent) {
    if (this.isSelecting) {
      const rect = this.canvas.nativeElement.getBoundingClientRect();
      this.selectionEnd.x = event.clientX - rect.left;
      this.selectionEnd.y = event.clientY - rect.top;
      this.drawSelectionBox();
    }
  }

  @HostListener('mouseup')
  endSelection() {
    this.isSelecting = false;
    this.isSelectionMade = true; // Enable the button once selection is done
  }

  drawSelectionBox() {
    const x = this.selectionStart.x;
    const y = this.selectionStart.y;
    const width = this.selectionEnd.x - this.selectionStart.x;
    const height = this.selectionEnd.y - this.selectionStart.y;

    cv.imshow(this.canvas.nativeElement, this.imageMat);
    this.ctx.strokeStyle = 'blue';
    this.ctx.lineWidth = 3; // Make it thicker
    this.ctx.strokeRect(x, y, width, height);
  }

  applyDarkenTextOnlyInSelection() {
    if (!this.imageMat || !this.isSelectionMade) return console.error('Image not loaded or no selection made');
    

    this.saveToHistory(this.imageMat);
    const x = Math.min(this.selectionStart.x, this.selectionEnd.x);
    const y = Math.min(this.selectionStart.y, this.selectionEnd.y);
    const width = Math.abs(this.selectionEnd.x - this.selectionStart.x);
    const height = Math.abs(this.selectionEnd.y - this.selectionStart.y);

    const selectedRect = new cv.Rect(x, y, width, height);
    const selectedRegion = this.imageMat.roi(selectedRect);

    const gray = new cv.Mat();
    cv.cvtColor(selectedRegion, gray, cv.COLOR_RGBA2GRAY, 0);

    const binary = new cv.Mat();
    cv.adaptiveThreshold(gray, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 11, 2);

    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const darkenedRegion = selectedRegion.clone();
    for (let i = 0; i < contours.size(); i++) {
      const mask = cv.Mat.zeros(selectedRegion.rows, selectedRegion.cols, cv.CV_8UC1);
      cv.drawContours(mask, contours, i, new cv.Scalar(255), -1);

      for (let row = 0; row < darkenedRegion.rows; row++) {
        for (let col = 0; col < darkenedRegion.cols; col++) {
          if (mask.ucharAt(row, col) === 255) {
            const pixel = darkenedRegion.ucharPtr(row, col);
            pixel[0] = Math.max(0, pixel[0] * 0.7);
            pixel[1] = Math.max(0, pixel[1] * 0.7);
            pixel[2] = Math.max(0, pixel[2] * 0.7);
          }
        }
      }

      mask.delete();
    }

    darkenedRegion.copyTo(selectedRegion);
    cv.imshow(this.canvas.nativeElement, this.imageMat);

    gray.delete();
    binary.delete();
    contours.delete();
    hierarchy.delete();
    darkenedRegion.delete();
  }



  removeBorder() {
    if (!this.imageMat) return console.error('Image is not loaded');

    this.saveToHistory(this.imageMat); // Save state before processing

    const gray = new cv.Mat();
    cv.cvtColor(this.imageMat, gray, cv.COLOR_RGBA2GRAY, 0);

    const binary = new cv.Mat();
    cv.threshold(gray, binary, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);

    const invertedBinary = new cv.Mat();
    cv.bitwise_not(binary, invertedBinary);

    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(invertedBinary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let largestArea = 0;
    let largestContour = null;

    for (let i = 0; i < contours.size(); i++) {
      const area = cv.contourArea(contours.get(i));
      if (area > largestArea) {
        largestArea = area;
        largestContour = contours.get(i);
      }
    }

    if (largestContour) {
      const boundingRect = cv.boundingRect(largestContour);
      const margin = 10;
      const x = Math.max(boundingRect.x - margin, 0);
      const y = Math.max(boundingRect.y - margin, 0);
      const width = Math.min(boundingRect.width + 2 * margin, this.imageMat.cols - x);
      const height = Math.min(boundingRect.height + 2 * margin, this.imageMat.rows - y);

      const croppedImage = this.imageMat.roi(new cv.Rect(x, y, width, height));
      cv.imshow(this.canvas.nativeElement, croppedImage);

      croppedImage.delete();
    } else {
      console.error('No suitable contour found');
    }

    gray.delete();
    binary.delete();
    invertedBinary.delete();
    contours.delete();
    hierarchy.delete();
  }

  rotateImage(angle: number) {
    if (!this.imageMat) return console.error('Image is not loaded');
    this.saveToHistory(this.imageMat);

    const center = new cv.Point(this.imageMat.cols / 2, this.imageMat.rows / 2);
    const M = cv.getRotationMatrix2D(center, angle, 1);
    const rotated = new cv.Mat();
    cv.warpAffine(this.imageMat, rotated, M, new cv.Size(this.imageMat.cols, this.imageMat.rows), cv.INTER_CUBIC, cv.BORDER_CONSTANT, new cv.Scalar());
    cv.imshow(this.canvas.nativeElement, rotated);
    this.imageMat = rotated.clone();

    rotated.delete();
    M.delete();
  }

  applyEffect(effect: 'darken' | 'lighten') {
    if (!this.imageMat) return console.error('Image is not loaded');
    this.saveToHistory(this.imageMat);

    let alpha = effect === 'darken' ? 0.7 : 1.3;
    this.imageMat.convertTo(this.imageMat, -1, alpha, 0); // Efficient brightness adjustment
    cv.imshow(this.canvas.nativeElement, this.imageMat);
  }

  deskewImageAutomatically() {
    if (!this.isOpenCvLoaded || !this.imageMat) return console.error('OpenCV.js is not loaded or image is not loaded');

    const gray = new cv.Mat();
    cv.cvtColor(this.imageMat, gray, cv.COLOR_RGBA2GRAY, 0);

    const edges = new cv.Mat();
    cv.Canny(gray, edges, 50, 150);

    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let maxRect = null;
    let largestArea = 0;

    for (let i = 0; i < contours.size(); i++) {
      const rect = cv.minAreaRect(contours.get(i));
      const area = rect.size.width * rect.size.height;
      if (area > largestArea) {
        largestArea = area;
        maxRect = rect;
      }
    }

    if (maxRect) {
      const angle = maxRect.angle;
      this.rotateImage(-angle); // Deskew based on angle
    }

    gray.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();
  }

}
