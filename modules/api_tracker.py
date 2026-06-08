import json
from datetime import datetime
from sqlmodel import Session
from database import engine, ApiRequest

PRICING = {
    "gpt-4o": {"input": 5.0, "output": 15.0}, # per 1M tokens
    "gpt-4-turbo": {"input": 10.0, "output": 30.0},
    "gpt-3.5-turbo": {"input": 0.5, "output": 1.5},
    "claude-3-opus": {"input": 15.0, "output": 75.0},
    "claude-3-5-sonnet": {"input": 3.0, "output": 15.0},
    "claude-3-haiku": {"input": 0.25, "output": 1.25},
    "gemini-1.5-pro": {"input": 3.5, "output": 10.5},
    "gemini-1.5-flash": {"input": 0.075, "output": 0.3},
}

def calculate_cost(model: str, input_tokens: int, output_tokens: int) -> tuple[float, float, float]:
    """Calculate input, output and total cost based on the model"""
    model_lower = model.lower()
    
    # Try exact match first
    rates = PRICING.get(model_lower)
    
    # Fallback substring matching
    if not rates:
        if "gpt-4o" in model_lower:
            rates = PRICING["gpt-4o"]
        elif "sonnet" in model_lower:
            rates = PRICING["claude-3-5-sonnet"]
        elif "opus" in model_lower:
            rates = PRICING["claude-3-opus"]
        elif "haiku" in model_lower:
            rates = PRICING["claude-3-haiku"]
        elif "gemini-1.5-pro" in model_lower:
            rates = PRICING["gemini-1.5-pro"]
        elif "gemini-1.5-flash" in model_lower:
            rates = PRICING["gemini-1.5-flash"]
        elif "gpt-4" in model_lower:
            rates = PRICING["gpt-4-turbo"]
        else:
            rates = {"input": 0.0, "output": 0.0} # Free / Unknown

    in_cost = (input_tokens / 1_000_000) * rates["input"]
    out_cost = (output_tokens / 1_000_000) * rates["output"]
    return in_cost, out_cost, in_cost + out_cost

def determine_provider(model: str) -> str:
    model_lower = model.lower()
    if "gpt" in model_lower or "openai" in model_lower or "o1" in model_lower:
        return "openai"
    if "claude" in model_lower or "anthropic" in model_lower:
        return "anthropic"
    if "gemini" in model_lower or "google" in model_lower:
        return "gemini"
    if "mistral" in model_lower or "mixtral" in model_lower:
        return "mistral"
    if "groq" in model_lower or "llama" in model_lower:
        return "groq"
    if "deepseek" in model_lower:
        return "deepseek"
    return "custom"

def track_api_call(
    endpoint: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    response_time_ms: int,
    salesperson_id: int = None,
    client_id: int = None,
    reasoning_tokens: int = 0,
    status_code: int = 200,
    success: bool = True,
    content_type: str = "general",
    request_meta: dict = None
):
    """
    Log an API call directly to the DB.
    """
    in_cost, out_cost, total_cost = calculate_cost(model, input_tokens, output_tokens)
    provider = determine_provider(model)
    total_tokens = input_tokens + output_tokens + reasoning_tokens
    
    req = ApiRequest(
        salesperson_id=salesperson_id,
        client_id=client_id,
        endpoint=endpoint,
        model=model,
        provider=provider,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        reasoning_tokens=reasoning_tokens,
        total_tokens=total_tokens,
        input_cost=in_cost,
        output_cost=out_cost,
        total_cost=total_cost,
        response_time_ms=response_time_ms,
        status_code=status_code,
        success=success,
        content_type=content_type,
        request_meta=request_meta,
        timestamp=datetime.utcnow()
    )
    
    with Session(engine) as session:
        session.add(req)
        session.commit()
