const express = require("express");
const cors = require("cors");
const Groq = require("groq-sdk");
require("dotenv").config();
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const PORT = process.env.PORT;

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static("dist"));

const groq = new Groq({ apiKey: GROQ_API_KEY });

async function getLLMResponse(text) {
  try {
    const chatCompletion = await groq.chat.completions.create({
      "messages": [
        { "role": "system", "content": "You are an expert English teacher and a friendly conversational assistant. First, check if the user's sentence contains abusive language (e.g., 'fuck', 'shit', racial slurs). If detected, respond ONLY with 'I can't respond to this sentence.' Otherwise, check grammatical correctness while ignoring capitalization, punctuation, and minor stylistic choices. If the sentence is correct, respond with 'Your sentence is correct.' If errors exist, provide ONLY the corrected version. Keep responses short, engaging, and conversational, like a real-time chat. Ask relevant follow-up questions to keep the conversation natural, but only one at a time. Keep responses under 100 characters. If a question is unclear, ask for clarification before answering. Never explain your corrections—just respond concisely and keep it human-like." },
        { "role": "user", "content": `Check this sentence for grammatical errors: "${text}"`}
      ],
      "model": "mixtral-8x7b-32768",
      "temperature": 0.03,
      "max_completion_tokens": 520,
      "top_p": 1,
      "stream": false,
      "stop": null
    });

    return chatCompletion.choices[0]?.message?.content || "No response.";
  } catch (error) {
    console.error("Error:", error);
    return "Error processing request.";
  }
}

app.post("/api/v1/llm", async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ "error": "Transcript is required." });

  const response = await getLLMResponse(text);
  res.json({ "response": response });
});

app.listen(PORT, () => console.log("Server running on port", PORT));
