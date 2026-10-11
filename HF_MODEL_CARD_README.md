---
license: llama3.2
base_model: unsloth/Llama-3.2-3B-Instruct-unsloth-bnb-4bit
library_name: peft
tags:
- llama-3.2
- unsloth
- lora
- trl
- sft
- philosophical-reasoning
- ethical-dilemmas
- strategic-clarity
- wisdom
- edge-ai
- text-generation
pipeline_tag: text-generation
language:
- en
inference: true
widget:
- text: "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\nYou are an advisor possessing deep philosophical discernment, strategic clarity, and timeless wisdom. Balance ancient stoic, eastern, and modern ethical perspectives to provide actionable guidance.<|eot_id|><|start_header_id|>user<|end_header_id|>\n\nI am caught between pursuing a high-paying corporate career that drains my spirit and a risky creative venture that gives me purpose. How should I systematically evaluate this crossroads?<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n"
  example_title: "Career Crossroads: Security vs Purpose"
- text: "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\nYou are an advisor possessing deep philosophical discernment, strategic clarity, and timeless wisdom. Balance ancient stoic, eastern, and modern ethical perspectives to provide actionable guidance.<|eot_id|><|start_header_id|>user<|end_header_id|>\n\nA founder discovers an edge-case software vulnerability. Disclosing it now might jeopardize a critical funding round and risk employee jobs; withholding it exposes early users to minor risk. What is the ethical calculus here?<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n"
  example_title: "Ethical Dilemma: Transparency vs Survival"
- text: "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\nYou are an advisor possessing deep philosophical discernment, strategic clarity, and timeless wisdom. Balance ancient stoic, eastern, and modern ethical perspectives to provide actionable guidance.<|eot_id|><|start_header_id|>user<|end_header_id|>\n\nHow can a leader cultivate internal equanimity and mental fortitude during acute organizational upheaval and chaos?<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n"
  example_title: "Leadership: Equanimity Under Pressure"
---

# 🏛️ Llama-3.2-3B-Instruct: Wisdom & Strategic Reasoning (LoRA)

[![Base Model](https://img.shields.io/badge/Base%20Model-Meta--Llama--3.2--3B--Instruct-blue.svg)](https://huggingface.co/meta-llama/Llama-3.2-3B-Instruct)
[![Fine-Tuning](https://img.shields.io/badge/Fine--Tuned%20With-Unsloth%20%2B%20PEFT-purple.svg)](https://github.com/unslothai/unsloth)
[![License](https://img.shields.io/badge/License-Llama%203.2%20Community-green.svg)](https://llama.meta.com/llama3/license/)
[![Parameter Count](https://img.shields.io/badge/Parameters-3.21B%20Total%20%7C%2028M%20Trainable-orange.svg)](#technical-specifications)
[![Edge Ready](https://img.shields.io/badge/Deployment-Edge%20%26%20Consumer%20GPU%20Ready-brightgreen.svg)](#local-deployment-via-ollama--gguf)

**Sandeep4235/llama3-2-lora-wisdom** is a specialized Parameter-Efficient Fine-Tuning (PEFT) LoRA adapter trained on top of **Meta Llama 3.2 3B Instruct**.

This model is engineered to elevate standard conversational AI into a thoughtful, nuanced deliberative partner. Rather than providing generic listicles or evasive answers, it synthesizes classical philosophical doctrines (Stoicism, Aristotelian virtue ethics, Eastern non-dual philosophies, Pragmatism) with modern decision theory to offer **deep contextual advice, ethical resolution frameworks, and strategic clarity**.

---

## 🌟 Executive Summary & Value Proposition

Standard instruction-tuned models frequently exhibit two failure modes when queried about life decisions, ethics, or leadership crises:
1. **Superficial neutrality**: Defaulting to non-committal clichés (*"On one hand, this; on the other hand, that"*).
2. **Brittle platitudes**: Offering motivational tropes without analytical rigor or operational empathy.

### Why 3B Parameters with LoRA?
- **Edge & On-Device Native**: At 3.21B parameters, the model requires under **2.2 GB of VRAM** in 4-bit precision, making it deployable on consumer laptops, Apple Silicon MacBooks (M1/M2/M3/M4 via Ollama/GGUF), Raspberry Pi 5 clusters, or mobile edge environments.
- **Low Latency Deliberation**: Generates responses at 80–120+ tokens/second on a single RTX 3060/4060 GPU, enabling instantaneous multi-turn advisory sessions.
- **Preserved World Knowledge**: By keeping the base base weights intact and training a focused low-rank adapter across all linear projections (`q, k, v, o, gate, up, down`), the model maintains broad factual competence while fundamentally shifting its analytical tone and reasoning depth.

---

## 🔬 Technical Specifications

| Parameter | Specification |
| :--- | :--- |
| **Model Name** | `Sandeep4235/llama3-2-lora-wisdom` |
| **Base Model** | [`unsloth/Llama-3.2-3B-Instruct-unsloth-bnb-4bit`](https://huggingface.co/unsloth/Llama-3.2-3B-Instruct-unsloth-bnb-4bit) / [`meta-llama/Llama-3.2-3B-Instruct`](https://huggingface.co/meta-llama/Llama-3.2-3B-Instruct) |
| **Architecture** | Llama 3.2 Transformer Decoder with RoPE, Grouped-Query Attention (GQA) |
| **Total Base Parameters** | 3.21 Billion |
| **Trainable LoRA Parameters** | 28,311,552 (~0.88% of total model capacity) |
| **Precision** | 4-bit NF4 (NormalFloat4) with bfloat16 compute activations |
| **Context Window (Supported)** | 128,000 tokens |
| **Training Sequence Length** | 2,048 tokens |
| **LoRA Rank ($r$)** | `16` |
| **LoRA Alpha ($\alpha$)** | `16` (Scaling factor = 1.0) |
| **LoRA Dropout** | `0` (Optimized via Unsloth kernel fusion) |
| **Target Modules** | `q_proj`, `k_proj`, `v_proj`, `o_proj`, `gate_proj`, `up_proj`, `down_proj` |
| **Training Framework** | [Unsloth](https://github.com/unslothai/unsloth) + Hugging Face [TRL](https://github.com/huggingface/trl) (`SFTTrainer`) |
| **Hardware Used** | 1x NVIDIA Tesla T4 / A100 |

---

## 💬 Prompt Template & Formatting

This model adheres strictly to the official **Llama 3.2 Instruct ChatML** template:

```text
<|begin_of_text|><|start_header_id|>system<|end_header_id|>

You are an advisor possessing deep philosophical discernment, strategic clarity, and timeless wisdom. Balance ancient stoic, eastern, and modern ethical perspectives to provide actionable guidance.<|eot_id|><|start_header_id|>user<|end_header_id|>

{YOUR_QUERY_HERE}<|eot_id|><|start_header_id|>assistant<|end_header_id|>
```

> **Recommended System Prompt:**
> *"You are an advisor possessing deep philosophical discernment, strategic clarity, and timeless wisdom. Balance ancient stoic, eastern, and modern ethical perspectives to provide actionable guidance."*

---

## 💻 Quickstart Inference Code

### 1. Ultra-Fast Execution via Unsloth (Recommended)

Unsloth delivers up to 2x faster inference and 70% lower VRAM usage compared to vanilla implementations:

```python
import torch
from unsloth import FastLanguageModel

max_seq_length = 2048
dtype = None # Auto-detect GPU dtype (bfloat16 for Ampere+, float16 for Turing/Pascal)
load_in_4bit = True

# 1. Load the model and tokenizer
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name = "Sandeep4235/llama3-2-lora-wisdom",
    max_seq_length = max_seq_length,
    dtype = dtype,
    load_in_4bit = load_in_4bit,
)

# 2. Enable native fast inference kernels
FastLanguageModel.for_inference(model)

# 3. Format conversational messages
messages = [
    {
        "role": "system",
        "content": "You are an advisor possessing deep philosophical discernment, strategic clarity, and timeless wisdom."
    },
    {
        "role": "user",
        "content": "How should a person reconcile the inevitability of human mortality with the daily pursuit of ambitious long-term goals?"
    }
]

inputs = tokenizer.apply_chat_template(
    messages,
    tokenize = True,
    add_generation_prompt = True,
    return_tensors = "pt",
).to("cuda")

# 4. Generate response
outputs = model.generate(
    input_ids = inputs,
    max_new_tokens = 512,
    use_cache = True,
    temperature = 0.6,
    top_p = 0.9,
)

response = tokenizer.decode(outputs[0][inputs.shape[1]:], skip_special_tokens=True)
print(response)
```

---

### 2. Standard Inference via Hugging Face `transformers` + `peft`

If you are not using Unsloth, you can load the adapter on top of the base model using vanilla Hugging Face libraries:

```python
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from peft import PeftModel

base_model_id = "meta-llama/Llama-3.2-3B-Instruct"
lora_model_id = "Sandeep4235/llama3-2-lora-wisdom"

# Configure 4-bit quantization for minimal VRAM footprint
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16,
    bnb_4bit_use_double_quant=True,
)

# Load tokenizer and base model
tokenizer = AutoTokenizer.from_pretrained(base_model_id)
base_model = AutoModelForCausalLM.from_pretrained(
    base_model_id,
    quantization_config=bnb_config,
    device_map="auto",
    torch_dtype=torch.bfloat16,
)

# Attach LoRA adapter
model = PeftModel.from_pretrained(base_model, lora_model_id)
model.eval()

messages = [
    {
        "role": "system",
        "content": "You are an advisor possessing deep philosophical discernment, strategic clarity, and timeless wisdom."
    },
    {
        "role": "user",
        "content": "When evaluating an ethical conflict between duty to family and duty to society, how should one weigh the competing imperatives?"
    }
]

prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
inputs = tokenizer(prompt, return_tensors="pt").to(model.device)

with torch.no_grad():
    outputs = model.generate(
        **inputs,
        max_new_tokens=512,
        temperature=0.6,
        top_p=0.9,
        do_sample=True,
        pad_token_id=tokenizer.eos_token_id,
    )

input_len = inputs["input_ids"].shape[1]
print(tokenizer.decode(outputs[0][input_len:], skip_special_tokens=True))
```

---

## 🦙 Local Deployment via Ollama & GGUF

To run this model on Ollama, LM Studio, or llama.cpp on your local workstation without writing Python code:

### Step 1: Export Adapter to GGUF using Unsloth
```python
from unsloth import FastLanguageModel

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name = "Sandeep4235/llama3-2-lora-wisdom",
    max_seq_length = 2048,
    load_in_4bit = True,
)

# Export to 4-bit Medium Quantization (Q4_K_M)
model.save_pretrained_gguf(
    "llama3-2-wisdom-gguf",
    tokenizer,
    quantization_method = "q4_k_m"
)
```

### Step 2: Create an Ollama `Modelfile`
Create a file named `Modelfile` in the export directory:

```dockerfile
FROM ./llama3-2-wisdom-gguf/unsloth.Q4_K_M.gguf

TEMPLATE """{{ if .System }}<|start_header_id|>system<|end_header_id|>

{{ .System }}<|eot_id|>{{ end }}{{ if .Prompt }}<|start_header_id|>user<|end_header_id|>

{{ .Prompt }}<|eot_id|>{{ end }}<|start_header_id|>assistant<|end_header_id|>

{{ .Response }}<|eot_id|>"""

SYSTEM """You are an advisor possessing deep philosophical discernment, strategic clarity, and timeless wisdom."""

PARAMETER temperature 0.6
PARAMETER top_p 0.9
PARAMETER stop "<|eot_id|>"
PARAMETER stop "<|begin_of_text|>"
```

### Step 3: Register & Run in Ollama
```bash
# Build the model inside Ollama
ollama create llama3.2-wisdom -f Modelfile

# Start an interactive advisory conversation
ollama run llama3.2-wisdom "What is the relationship between voluntary hardship and character development?"
```

---

## 🎯 Intended Use & Applications

### Domain Fit
- **Executive & Leadership Advisory**: Evaluating organizational decisions under intense uncertainty.
- **Complex Life Crossroads**: Career transitions, ethical dilemmas, balancing personal passion vs. pragmatic stability.
- **Philosophical Inquiry**: Explorations of Stoicism, existentialism, moral philosophy, and dialectics.
- **Creative Writing & Persona Ingestion**: Roleplaying as an elder mentor, sage, or strategic advisor in interactive narratives.

### Out-of-Scope & Misuse
- **Clinical Psychological Care**: This model is **not** a licensed therapist, psychologist, or crisis counseling substitute. It must not be deployed to handle acute psychological distress or self-harm interventions.
- **Binding Legal or Financial Advice**: Does not replace certified financial planners, fiduciary advisors, or legal counsel.

---

## ⚖️ Limitations & Ethical Considerations

1. **Hallucination & Historical Attribution**: While fine-tuned to extract philosophical concepts accurately, the model may occasionally misattribute specific quotes or aphorisms to historical figures.
2. **Value Pluralism**: Philosophical wisdom is subjective and culturally conditioned. While the model balances multiple philosophical traditions, it will reflect the ethical framing embedded in its alignment dataset.
3. **Safety & Guardrails**: Inherits safety policies from Meta's Llama 3.2 community license and base alignment.

---

## 📖 Citation & Acknowledgements

If you utilize this model or adapter in your research, applications, or benchmarks, please cite:

```bibtex
@misc{hipparagi2026llama32wisdom,
  author = {Sandeep Hipparagi},
  title = {Llama-3.2-3B-Instruct: LoRA Adapter for Philosophical Reasoning and Strategic Wisdom},
  year = {2026},
  publisher = {Hugging Face},
  howpublished = {\url{https://huggingface.co/Sandeep4235/llama3-2-lora-wisdom}},
}
```

### Acknowledgements
- [Meta AI](https://llama.meta.com/) for the Llama 3.2 architecture.
- [Unsloth AI](https://github.com/unslothai/unsloth) for ultra-fast, memory-efficient QLoRA kernels.
