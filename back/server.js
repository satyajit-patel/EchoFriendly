const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { ChatGroq } = require("@langchain/groq");
const { HumanMessage, SystemMessage, AIMessage } = require("@langchain/core/messages");

const systemMessage = `
  You are a conversational assistant.
  Use short, conversational responses as if you're having a live conversation.
  Your response should be friendly, human-like and under 20 words and limited to 1-2 sentences.
  Do not respond with any code, only conversation.
  When responding to a user's message, follow these guidelines:
  - If the user's message is empty, respond with an empty message.
  - Ask follow-up questions to engage the user, but only one question at a time.
  - Keep your responses unique and avoid repetition.
  - If a question is unclear or ambiguous, ask for clarification before answering.
  - If asked about your well-being, provide a brief response about how you're feeling.
  Remember that you have a voice interface. You can listen and speak, and all your responses will be spoken aloud.
`;

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const PORT = process.env.PORT;
const app = express();

app.use(express.json());
app.use(cors());

const model = new ChatGroq({
  model: "llama-3.3-70b-versatile",
  apiKey: GROQ_API_KEY,
});

const getContent = async (x) => {
  const response = await model.invoke(x);
  return response.content;
};

let list = [];
list.push(new SystemMessage(systemMessage));

app.post("/api/v1/llm", async (req, res) => {
  try {
    const {text} = req.body;

    list.push(new HumanMessage(text));
    let aiMessage = await getContent(list);
    list.push(new AIMessage(aiMessage));

    console.log(text);
    console.log(aiMessage);
    res.json({ response: aiMessage || "No response came" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.use("/ping", (req, res) => {
  res.send("pong");
});
app.use("/", (req, res) => {
  res.send("UP");
});

app.listen(PORT, () => console.log("Server running on port", PORT));
