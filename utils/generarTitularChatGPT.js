// utils/generarTitularChatGPT.js
const OpenAI = require("openai");
require("dotenv").config();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function generarTitularConversado(titularOriginal) {
  try {
    const prompt = `
Genera un titular nuevo basado en este titular:

"${titularOriginal}"

Requisitos:
- Debe sentirse como que alguien está conversando.
- Debe ser cálido, casual, cercano.
- Sin exagerar y sin sonar a clickbait.
- Mantén la idea original.
- NO menciones que estás reescribiendo.
- Solo regresa el titular, nada más.
    `;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini", // rápido y barato para titulares
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
    });

    return completion.choices[0].message.content.trim();
  } catch (err) {
    console.error("❌ Error generando titular con ChatGPT:", err);
    return titularOriginal; // fallback seguro
  }
}

module.exports = generarTitularConversado;
