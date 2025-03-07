// import { useState } from "react";

// const App = () => {
//   const [isLoading, setIsLoading] = useState(false);
//   const apiKey = import.meta.env.VITE_DEEPGRAM_API_KEY;

//   const handleTTS = async () => {
//     setIsLoading(true);
//     const url = "https://api.deepgram.com/v1/speak";
//     const options = {
//       method: "POST",
//       headers: {
//         Authorization: "Token " + apiKey,
//         "Content-Type": "application/json",
//       },
//       body: JSON.stringify({ text: "Hello, this is a test speech." }),
//     };

//     try {
//       const response = await fetch(url, options);
//       const blob = await response.blob();
//       const audioURL = URL.createObjectURL(blob);
//       const audio = new Audio(audioURL);
//       audio.play();
//     } catch (error) {
//       console.error("App Error:", error);
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   return (
//     <div className="flex flex-col items-center justify-center h-screen">
//       <button
//         onClick={handleTTS}
//         className="px-4 py-2 bg-blue-500 text-white rounded-lg"
//         disabled={isLoading}
//       >
//         {isLoading ? "Speaking..." : "Speak"}
//       </button>
//     </div>
//   );
// };

// export default App;


import React, { useState, useEffect, useRef } from "react";
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";

// Create a file named audioProcessor.js in the public folder with the content from before

const App = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [currentSentence, setCurrentSentence] = useState("");
  const [error, setError] = useState("");
  const liveClientRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const workletNodeRef = useRef(null);
  const transcriptPartsRef = useRef([]);

  // Function to start recording and transcription
  const startListening = async () => {
    try {
      setError("");
      
      // Get API key (in a real app, this should be securely managed)
      const DEEPGRAM_API_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY;
      if (!DEEPGRAM_API_KEY) {
        throw new Error("Deepgram API key is missing");
      }

      // Initialize Deepgram client
      const deepgram = createClient(DEEPGRAM_API_KEY);
      
      // Create a live transcription instance with options similar to your Python example
      const liveClient = deepgram.listen.live({ 
        model: "nova-2",
        punctuate: true,
        language: "en-US",
        encoding: "linear16",
        channels: 1,
        sample_rate: 16000,
        endpointing: true,  // Enable endpointing like in Python example
        interim_results: true // Get non-final results
      });
      
      // Store reference to live client
      liveClientRef.current = liveClient;
      
      // Reset transcript parts
      transcriptPartsRef.current = [];
      setCurrentSentence("");
      setTranscript("");

      // Listen for the open event
      liveClient.on(LiveTranscriptionEvents.Open, () => {
        console.log("Connection established with Deepgram");
        
        // Listen for transcription events
        liveClient.on(LiveTranscriptionEvents.Transcript, (result) => {
          const sentence = result.channel.alternatives[0].transcript;
          
          if (sentence.trim()) {
            console.log(`Got transcript: ${sentence}, speech_final: ${result.speech_final}`);
            
            if (!result.speech_final) {
              // This is an interim result, update the current sentence
              setCurrentSentence(sentence);
            } else {
              // This is a final result
              transcriptPartsRef.current.push(sentence);
              const fullTranscript = transcriptPartsRef.current.join(' ');
              
              console.log(`Full sentence: ${fullTranscript}`);
              
              // Update transcript with the full sentence
              setTranscript(prev => prev + (prev ? " " : "") + fullTranscript);
              
              // Reset for next sentence
              transcriptPartsRef.current = [];
              setCurrentSentence("");
            }
          }
        });
      });

      // Listen for error events
      liveClient.on(LiveTranscriptionEvents.Error, (error) => {
        console.error("Deepgram error:", error);
        setError(`Transcription error: ${error.message || "Unknown error"}`);
      });

      // Keep connection alive
      const keepAliveInterval = setInterval(() => {
        if (liveClientRef.current && liveClientRef.current.getReadyState() === 1) {
          liveClientRef.current.keepAlive();
        }
      }, 10000); // Send keepalive every 10 seconds

      // Get microphone access
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      // Store reference to media stream
      mediaStreamRef.current = mediaStream;

      // Create an audio context
      const audioContext = new AudioContext({
        sampleRate: 16000 // Match the sample rate with what we specified to Deepgram
      });
      audioContextRef.current = audioContext;
      
      // Create a source from the microphone stream
      const source = audioContext.createMediaStreamSource(mediaStream);

      try {
        // Add the audio worklet module
        await audioContext.audioWorklet.addModule('/audioProcessor.js');
        
        // Create an audio worklet node
        const workletNode = new AudioWorkletNode(audioContext, 'audio-processor');
        workletNodeRef.current = workletNode;
        
        // Set up message handling from the audio worklet
        workletNode.port.onmessage = (event) => {
          if (liveClientRef.current && liveClientRef.current.getReadyState() === 1) {
            const audioData = convertFloat32ToInt16(event.data);
            liveClientRef.current.send(audioData);
          }
        };
        
        // Connect the nodes
        source.connect(workletNode);
        // Don't connect to destination to avoid feedback
        // workletNode.connect(audioContext.destination);
      } catch (workletError) {
        console.warn("AudioWorklet not supported, falling back to ScriptProcessor", workletError);
        
        // Fallback to ScriptProcessor if AudioWorklet is not supported
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        workletNodeRef.current = processor;
        
        processor.onaudioprocess = (e) => {
          if (liveClientRef.current && liveClientRef.current.getReadyState() === 1) {
            const inputData = e.inputBuffer.getChannelData(0);
            const audioData = convertFloat32ToInt16(inputData);
            liveClientRef.current.send(audioData);
          }
        };
        
        source.connect(processor);
        // Don't connect to destination to avoid feedback
        processor.connect(audioContext.destination);
      }

      setIsListening(true);
      
      // Store the interval to clear it later
      return () => clearInterval(keepAliveInterval);
    } catch (err) {
      console.error("Error starting transcription:", err);
      setError(`Failed to start: ${err.message}`);
    }
  };

  // Function to stop recording and transcription
  const stopListening = () => {
    try {
      // Close Deepgram connection
      if (liveClientRef.current) {
        liveClientRef.current.requestClose();
        liveClientRef.current = null;
      }

      // Stop the audio processing
      if (workletNodeRef.current) {
        workletNodeRef.current.disconnect();
        workletNodeRef.current = null;
      }

      // Close audio context
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      // Stop microphone stream
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }
    } catch (err) {
      console.error("Error stopping transcription:", err);
    } finally {
      setIsListening(false);
    }
  };

  // Helper function to convert audio format
  const convertFloat32ToInt16 = (buffer) => {
    const l = buffer.length;
    const buf = new Int16Array(l);
    
    for (let i = 0; i < l; i++) {
      buf[i] = Math.min(1, Math.max(-1, buffer[i])) * 0x7FFF;
    }
    
    return buf.buffer;
  };

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-bold text-center mb-6">Live Audio Transcription</h1>
        
        <div className="mb-6">
          <button
            onClick={isListening ? stopListening : startListening}
            className={`w-full py-3 px-4 rounded-lg text-white font-medium ${
              isListening 
                ? "bg-red-600 hover:bg-red-700" 
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {isListening ? "Stop Listening" : "Start Listening"}
          </button>
        </div>
        
        <div className="bg-gray-50 rounded-lg p-4 h-64 overflow-y-auto mb-4">
          <h2 className="text-lg font-semibold mb-2">Transcript</h2>
          <div className="whitespace-pre-wrap">
            {transcript || (isListening ? "Listening..." : "Click 'Start Listening' to begin transcription.")}
          </div>
        </div>
        
        {isListening && (
          <div className="bg-blue-50 rounded-lg p-4 mb-4 border border-blue-200">
            <h2 className="text-lg font-semibold mb-2">Current Speech</h2>
            <div className="whitespace-pre-wrap italic">
              {currentSentence || "..."}
            </div>
          </div>
        )}
        
        {error && (
          <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-lg">
            {error}
          </div>
        )}
        
        <div className="mt-6 text-sm text-gray-500">
          <p>Status: {isListening ? "Connected to Deepgram" : "Disconnected"}</p>
        </div>
      </div>
    </div>
  );
};

export default App;