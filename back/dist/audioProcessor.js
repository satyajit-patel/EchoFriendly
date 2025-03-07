class AudioProcessor extends AudioWorkletProcessor {
    process(inputs, outputs) {
      // Send the audio data to the main thread
      if (inputs[0] && inputs[0][0]) {
        this.port.postMessage(inputs[0][0]);
      }
      return true;
    }
  }
  
  registerProcessor('audio-processor', AudioProcessor);