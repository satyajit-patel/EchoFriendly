import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createClient, LiveTTSEvents } from "@deepgram/sdk";
import dotenv from "dotenv";
import cors from "cors";
import fs from "fs";

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: "http://localhost:5173" } });

app.use(cors());

const apiKey = process.env.DEEPGRAM_API_KEY;
const deepgram = createClient(apiKey);

io.on("connection", (socket) => {
  console.log("Client connected");

  socket.on("request-welcome", async () => {
    console.log("🟢 Request received: Generating Welcome Message...");

    try {
      const liveTTS = deepgram.speak.live({
        model: "aura-asteria-en",
        encoding: "linear16",
        sample_rate: 48000,
      });

      let audioChunks = [];

      liveTTS.on(LiveTTSEvents.Open, () => {
        console.log("✅ TTS Connection Opened.");
        try {
          liveTTS.sendText("Hello! How can I help you today?");
          liveTTS.flush();
        } catch (err) {
          console.error("❌ Error sending TTS text:", err);
        }
      });

      liveTTS.on(LiveTTSEvents.Audio, (data) => {
        try {
          console.log("🔵 Receiving audio data...");
          audioChunks.push(Buffer.from(data.buffer));
        } catch (err) {
          console.error("❌ Error processing audio buffer:", err);
        }
      });

      liveTTS.on(LiveTTSEvents.Close, async () => {
        console.log("🟡 TTS Connection Closed. Processing audio...");

        try {
          if (audioChunks.length === 0) {
            console.error("❌ No audio chunks received.");
            socket.emit("tts-error", "No audio data received.");
            return;
          }

          const audioBuffer = Buffer.concat(audioChunks);
          const filePath = "output.wav";

          fs.writeFile(filePath, audioBuffer, (err) => {
            if (err) {
              console.error("❌ Error saving audio file:", err);
              socket.emit("tts-error", "Error saving audio file.");
            } else {
              console.log("✅ Audio file saved:", filePath);
              socket.emit("tts-audio-url", `http://localhost:5000/${filePath}`);
            }
          });
        } catch (err) {
          console.error("❌ Error handling TTS audio:", err);
          socket.emit("tts-error", "Error handling TTS audio.");
        }
      });

      liveTTS.on(LiveTTSEvents.Error, (error) => {
        console.error("❌ TTS Error:", error);
        socket.emit("tts-error", error.message || "TTS processing error.");
      });
    } catch (err) {
      console.error("❌ Error setting up Deepgram TTS:", err);
      socket.emit("tts-error", "Deepgram setup failed.");
    }
  });

  socket.on("disconnect", () => {
    console.log("🔴 Client disconnected");
  });
});

server.listen(5000, () => {
  console.log("🚀 Server running on http://localhost:5000");
});
