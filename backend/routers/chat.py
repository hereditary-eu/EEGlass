from fastapi import APIRouter, HTTPException
from backend.models.chatbot import ChatRequest
from backend.config import CONFIG


chat_router = APIRouter(prefix="/chatbot", tags=["chat"])

@chat_router.post("/chat")
async def chat(req: ChatRequest):
    print("Received chat request", flush=True)
    print("Using model inside endpoint:", CONFIG.MODEL, flush=True)

    if CONFIG.client is None:
        raise HTTPException(
            status_code=503,
            detail="Chat is not configured: set OPENAI_API_KEY (and OPENAI_BASE_URL if using SERVER mode).",
        )

    # print("Received messages:", req.messages)
    completion = CONFIG.client.chat.completions.create(
        model=CONFIG.MODEL, messages=req.messages, timeout=180
    )
    response = completion.choices[0].message.content

    print("Generated response:", response)
    return {"reply": response}
