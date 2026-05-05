from __future__ import annotations

import numpy as np


def compute_gradient_channel_attribution(model, window: np.ndarray, target_class_id: int, torch_module) -> np.ndarray:
    batch = torch_module.tensor(window[None, :, :], dtype=torch_module.float32, requires_grad=True)

    model.zero_grad(set_to_none=True)
    logits = model(batch)
    target_score = logits[0, target_class_id]
    target_score.backward()

    gradients = batch.grad.detach().cpu().numpy()[0]
    inputs = batch.detach().cpu().numpy()[0]
    signed_scores = np.mean(inputs * gradients, axis=1)
    return signed_scores.astype(np.float32, copy=False)
