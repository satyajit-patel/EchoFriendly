import React, { useState, useEffect, useRef } from "react";
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import {getLlmResponse} from "../apis/Api";

const Home = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [currentSentence, setCurrentSentence] = useState("");
  const [llmResponse, setLlmResponse] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const liveClientRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const workletNodeRef = useRef(null);
  const transcriptPartsRef = useRef([]);
  // Add a reference to track the current audio playback
  const currentAudioRef = useRef(null);
  // Add a reference to track whether TTS is playing
  const isTTSPlayingRef = useRef(false);
  
  const apiKey = import.meta.env.VITE_DEEPGRAM_API_KEY;

  // Function to convert text to speech using Deepgram
  const handleTTS = async (text) => {
    setIsLoading(true);
    
    // Stop any currently playing audio
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    
    const url = "https://api.deepgram.com/v1/speak";
    const options = {
      method: "POST",
      headers: {
        Authorization: "Token " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    };

    try {
      const response = await fetch(url, options);
      const blob = await response.blob();
      const audioURL = URL.createObjectURL(blob);
      const audio = new Audio(audioURL);
      
      // Store reference to the current audio
      currentAudioRef.current = audio;
      
      // Temporarily suspend the microphone stream while TTS is playing
      suspendMicrophoneStream();
      isTTSPlayingRef.current = true;
      
      // Add event listener to clean up when audio ends
      audio.addEventListener('ended', () => {
        if (currentAudioRef.current === audio) {
          currentAudioRef.current = null;
          isTTSPlayingRef.current = false;
          // Resume the microphone stream when TTS completes
          resumeMicrophoneStream();
        }
      });
      
      audio.play();
    } catch (error) {
      console.error("TTS Error:", error);
      setError("Failed to convert text to speech: " + error.message);
      isTTSPlayingRef.current = false;
      resumeMicrophoneStream();
    } finally {
      setIsLoading(false);
    }
  };

  // Function to suspend microphone stream during TTS playback
  const suspendMicrophoneStream = () => {
    if (liveClientRef.current && liveClientRef.current.getReadyState() === 1) {
      console.log("Temporarily suspending microphone stream during TTS playback");
      // Disconnect the worklet node to stop sending audio to Deepgram
      if (workletNodeRef.current) {
        workletNodeRef.current.disconnect();
      }
    }
  };

  // Function to resume microphone stream after TTS playback
  const resumeMicrophoneStream = () => {
    if (isListening && liveClientRef.current && liveClientRef.current.getReadyState() === 1) {
      console.log("Resuming microphone stream after TTS playback");
      
      // Reconnect the audio processing nodes if needed
      if (audioContextRef.current && mediaStreamRef.current && workletNodeRef.current) {
        const source = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
        
        // Reconnect the nodes based on what type of processor we're using
        if (workletNodeRef.current instanceof AudioWorkletNode) {
          source.connect(workletNodeRef.current);
        } else {
          // For ScriptProcessor
          source.connect(workletNodeRef.current);
          workletNodeRef.current.connect(audioContextRef.current.destination);
        }
      }
    }
  };

  // Function to start recording and transcription
  const startListening = async () => {
    try {
      setError("");
      
      if (!apiKey) {
        throw new Error("Deepgram API key is missing");
      }

      // Initialize Deepgram client
      const deepgram = createClient(apiKey);
      
      // Create a live transcription instance with options
      const liveClient = deepgram.listen.live({ 
        model: "nova-2",
        punctuate: true,
        language: "en-US",
        encoding: "linear16",
        channels: 1,
        sample_rate: 16000,
        endpointing: true,
        interim_results: true
      });
      
      // Store reference to live client
      liveClientRef.current = liveClient;
      
      // Reset transcript parts
      transcriptPartsRef.current = [];
      setCurrentSentence("");
      setTranscript("");
      setLlmResponse("");

      // Listen for the open event
      liveClient.on(LiveTranscriptionEvents.Open, () => {
        console.log("Connection established with Deepgram");
        
        // Listen for transcription events
        liveClient.on(LiveTranscriptionEvents.Transcript, async (result) => {
          // If TTS is currently playing, ignore transcription results
          if (isTTSPlayingRef.current) {
            console.log("Ignoring transcription while TTS is playing");
            return;
          }
          
          const sentence = result.channel.alternatives[0].transcript;
          
          if (sentence.trim()) {
            console.log(`Got transcript: ${sentence}, speech_final: ${result.speech_final}`);
            
            // If user starts speaking, stop any current audio playback
            if (currentAudioRef.current) {
              console.log("Stopping current audio as user is speaking");
              currentAudioRef.current.pause();
              currentAudioRef.current = null;
              isTTSPlayingRef.current = false;
            }
            
            if (!result.speech_final) {
              // This is an interim result, update the current sentence
              setCurrentSentence(sentence);
            } else {
              // This is a final result
              transcriptPartsRef.current.push(sentence);
              const fullTranscript = transcriptPartsRef.current.join(' ');
              
              console.log(`Full sentence: ${fullTranscript}`);
              
              // Reset transcript and set new one
              setTranscript(fullTranscript);
              
              // Get LLM response for the full transcript
              const response = await getLlmResponse({ text: fullTranscript });
              setLlmResponse(response);
              
              // Convert LLM response to speech automatically
              handleTTS(response);
              
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
          // Only send audio to Deepgram if TTS is not playing
          if (!isTTSPlayingRef.current && 
              liveClientRef.current && 
              liveClientRef.current.getReadyState() === 1) {
            const audioData = convertFloat32ToInt16(event.data);
            liveClientRef.current.send(audioData);
          }
        };
        
        // Connect the nodes
        source.connect(workletNode);
        // Don't connect to destination to avoid feedback
      } catch (workletError) {
        console.warn("AudioWorklet not supported, falling back to ScriptProcessor", workletError);
        
        // Fallback to ScriptProcessor if AudioWorklet is not supported
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        workletNodeRef.current = processor;
        
        processor.onaudioprocess = (e) => {
          // Only send audio to Deepgram if TTS is not playing
          if (!isTTSPlayingRef.current && 
              liveClientRef.current && 
              liveClientRef.current.getReadyState() === 1) {
            const inputData = e.inputBuffer.getChannelData(0);
            const audioData = convertFloat32ToInt16(inputData);
            liveClientRef.current.send(audioData);
          }
        };
        
        source.connect(processor);
        // Connect to destination for ScriptProcessor to work
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
      // Stop any currently playing audio
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      
      // Reset TTS playing flag
      isTTSPlayingRef.current = false;
      
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
      // Make sure to stop any playing audio when component unmounts
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      stopListening();
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-3xl mx-auto bg-gray-800 rounded-lg shadow-lg p-6 border border-gray-700">
        <h1 className="text-2xl font-bold text-center mb-6 text-gray-100">Interactive Voice Assistant</h1>
        
        <div className="mb-6">
          <button
            onClick={isListening ? stopListening : startListening}
            className={`w-full py-3 px-4 rounded-lg text-white font-medium transition-all duration-300 ${
              isListening 
                ? "bg-red-600 hover:bg-red-700" 
                : "bg-indigo-600 hover:bg-indigo-700"
            }`}
            disabled={isLoading}
          >
            {isListening ? "Leave Room" : "Join Room"}
          </button>
        </div>
        
        {/* Transcript Section */}
        <div className="bg-gray-700 rounded-lg p-4 mb-4 border border-gray-600">
          <h2 className="text-lg font-semibold mb-2 text-gray-200">Your Speech</h2>
          <div className="whitespace-pre-wrap min-h-16 text-gray-300">
            {transcript || (isListening && currentSentence) || 
              (isListening ? "Listening..." : "Click 'Join Room' to begin.")}
          </div>
        </div>
        
        {/* LLM Response Section */}
        <div className="bg-gray-750 rounded-lg p-4 mb-4 border border-indigo-900">
          <h2 className="text-lg font-semibold mb-2 text-indigo-300">Assistant Response</h2>
          <div className="whitespace-pre-wrap min-h-16 text-gray-200">
            {isLoading ? 
              <div className="flex items-center">
                <div className="animate-pulse mr-2 text-indigo-300">Processing...</div>
                <div className="w-4 h-4 border-t-2 border-indigo-500 rounded-full animate-spin"></div>
              </div> : 
              llmResponse || "Wait a sec.. No response yet"}
          </div>
        </div>
        
        {error && (
          <div className="mt-4 p-3 bg-red-900 text-red-200 rounded-lg border border-red-700">
            {error}
          </div>
        )}
        
        <div className="mt-6 text-sm text-gray-400 flex justify-between">
          <p>Status: {isListening ? "Listening" : "Idle"}</p>
          {isLoading && <p>Processing response...</p>}
        </div>
      </div>
    </div>
  );
};

export default Home;