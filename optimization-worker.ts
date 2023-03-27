import { optimize } from "./pricing"; 

self.onmessage = function(e) {
    console.log('Optimization Worker: Message received from main script', e);

    const { taskId, scalingConfig, records, pricePerHour } = e.data
    const { bestPrice, bestTarget } = optimize(scalingConfig, records, pricePerHour)
    self.postMessage({ taskId, bestPrice, bestTarget })
  }

  export {} // make this a module