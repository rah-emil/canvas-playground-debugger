// В node нет ImageData — подставляем минимальную реализацию для юнит-тестов.
class ImageDataStub {
  readonly width: number
  readonly height: number
  readonly data: Uint8ClampedArray

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.data = new Uint8ClampedArray(width * height * 4)
  }
}

globalThis.ImageData ??= ImageDataStub as unknown as typeof ImageData
