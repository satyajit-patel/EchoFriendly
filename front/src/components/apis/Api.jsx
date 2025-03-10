import axios from "axios"

const VITE_BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

// Function to get LLM response
export const getLlmResponse = async (text) => {
    try {
      const response = await axios.post(`${VITE_BACKEND_URL}/api/v1/llm`, text);
      return response.data.response || "No response from LLM";
    } catch (error) {
      console.error("Error getting backend response:", error);
      return "Error getting backend response";
    }
};