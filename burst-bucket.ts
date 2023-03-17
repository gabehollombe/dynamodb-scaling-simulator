export class BurstBuckets {
    public buckets: number[];
    private currentIndex: number;
  
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
      for (let i = 0; i < this.capacity; i++) {
        const bucket = this.buckets[(this.currentIndex + i) % this.capacity];
        if (remainingAmount > bucket) {
          remainingAmount -= bucket;
          this.buckets[(this.currentIndex + i) % this.capacity] = 0;
        } else {
          this.buckets[(this.currentIndex + i) % this.capacity] -= remainingAmount;
          break;
        }
      }
      if (remainingAmount > 0) {
        throw new Error("Not enough burst capacity!");
      }
    }
  
    public sum(): number {
      return this.buckets.reduce((total, num) => total + num, 0);
    }
  }