export class BurstBuckets {
  public buckets: number[];
  public currentIndex: number;

  constructor(private capacity: number) {
    this.buckets = Array(capacity).fill(0);
    this.currentIndex = 0;
  }

  public add(num: number): void {
    this.buckets[this.currentIndex] = num;
    this.currentIndex = (this.currentIndex + 1) % this.capacity;
  }

  public consume(amount: number): void {
    let remainingAmount = amount;
    let i = 0
    while (remainingAmount > 0 && i < this.capacity) {
      const bucketIndex = (this.currentIndex + i) % this.capacity;
      const bucket = this.buckets[bucketIndex];

      if (bucket >= remainingAmount) {
        this.buckets[bucketIndex] = bucket - remainingAmount
        remainingAmount = 0
      } else {
        remainingAmount -= this.buckets[bucketIndex]
        this.buckets[bucketIndex] = 0
      }

      i++
    }

    if (remainingAmount > 0) {
      throw new Error("Not enough burst capacity!");
    }
  }
  

  public sum(): number {
    return this.buckets.reduce((total, num) => total + num, 0);
  }
}
