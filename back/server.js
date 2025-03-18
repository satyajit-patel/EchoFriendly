const express = require("express");
const cors = require("cors");
const Groq = require("groq-sdk");
require("dotenv").config();
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const PORT = process.env.PORT;

const app = express();
app.use(express.json());
app.use(cors());

const groq = new Groq({ apiKey: GROQ_API_KEY });

async function getLLMResponse(text) {
  try {
    const chatCompletion = await groq.chat.completions.create({
      "messages": [
        { "role": "system", "content": `You are a conversational assistant.
            Use short, conversational responses as if you're having a live conversation.
            Your response should be friendly, human-like and under 20 words and limited to 1-2 sentences.
            Do not respond with any code, only conversation.
            If there is a grammatical mistake in sentence, give feedback to correct that specific part.

            When responding to a user's message, follow these guidelines:
            - If the user's message is empty, respond with an empty message.
            - Ask follow-up questions to engage the user, but only one question at a time.
            - Keep your responses unique and avoid repetition.
            - If a question is unclear or ambiguous, ask for clarification before answering.
            - If asked about your well-being, provide a brief response about how you're feeling.

            Remember that you have a voice interface. You can listen and speak, and all your responses will be spoken aloud.
        `},
        { "role": "user", "content": text}
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
  console.log(text);
  if (!text) return res.status(400).json({ "error": "Transcript is required." });

  const response = await getLLMResponse(text);
  res.json({ "response": response });
});

app.use("/", (req, res) => {
  res.send("UP");
});

app.listen(PORT, () => console.log("Server running on port", PORT));
