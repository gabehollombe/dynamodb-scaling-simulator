import { BurstBuckets } from './burst-bucket';

describe('BurstBuckets', () => {
  let burstBuckets: BurstBuckets;

  beforeEach(() => {
    burstBuckets = new BurstBuckets(3);
  });

  it('should add numbers to buckets in a sliding fashion', () => {
    burstBuckets.add(1);
    burstBuckets.add(2);
    expect(burstBuckets.buckets).toEqual([1, 2, 0]);
    burstBuckets.add(3);
    burstBuckets.add(4);
    expect(burstBuckets.buckets).toEqual([4, 2, 3]);
  });

  it('should consume numbers from buckets', () => {
    burstBuckets.add(1)
    burstBuckets.add(3)
    burstBuckets.add(5)
    expect(burstBuckets.buckets).toEqual([1, 3, 5]);
    expect(burstBuckets.sum()).toEqual(9)

    burstBuckets.consume(2);
    expect(burstBuckets.buckets).toEqual([0, 2, 5]);
    expect(burstBuckets.sum()).toEqual(7)

    burstBuckets.add(1)
    burstBuckets.add(3)
    burstBuckets.add(5)
    expect(burstBuckets.sum()).toEqual(9)
    burstBuckets.consume(9);
    expect(burstBuckets.buckets).toEqual([0, 0, 0]);
  })

  it('foo', () => {
    let b = new BurstBuckets(5)
    b.buckets = [
        // 785.0714285714287,
        // 786.0714285714287,
        // 632.0714285714287,
        // 786.0714285714287,
        // 786.5714285714287
        1.0,
        2.0,
        3.0,
        4.0,
        5.0
      ]
      b.currentIndex = 2

    b.sum() //?
    b.consume(15.0)

  })

  it('should throw an error when consuming more than capacity', () => {
    burstBuckets.add(1)
    burstBuckets.add(2)
    burstBuckets.add(3)
    expect(() => burstBuckets.consume(7)).toThrowError('Not enough burst capacity!');
  });

  it('should sum the numbers in the buckets', () => {
    burstBuckets.add(1)
    burstBuckets.add(2)
    burstBuckets.add(3)
    expect(burstBuckets.sum()).toEqual(6);
  });
});
