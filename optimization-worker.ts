import { optimize } from "./pricing"; 

self.onmessage = function(e) {
    const { taskId, scalingConfig, records, pricePerHour } = e.data
    const { bestMin, bestMax, bestPrice, bestTarget } = optimize(scalingConfig, records, pricePerHour)
    self.postMessage({ taskId, bestMin, bestMax, bestPrice, bestTarget })
  }

  export {} // make this a module