import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MultiPageTiffComponentComponent } from './multi-page-tiff-component.component';

describe('MultiPageTiffComponentComponent', () => {
  let component: MultiPageTiffComponentComponent;
  let fixture: ComponentFixture<MultiPageTiffComponentComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MultiPageTiffComponentComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MultiPageTiffComponentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
