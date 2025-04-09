# Wildcards for NovelAI Diffusion 4.0

> **Turn `__wildcards__` into `||text|some more text|some more random text||` automatically—before your prompt ever reaches NovelAI.**

A lightweight, privacy‑friendly Chrome extension that intercepts **`POST https://image.novelai.net/ai/generate-image`** and expands any `__wildcard__` tokens inside the request body using text files you upload.  
Works like a1111 webui's wildcards extension, and the wildcards txt files for a1111 webui can be used, untouched.

---

## ✨ Features
| | |
|---|---|
| **Wildcard replacement** | Detects `__name__` tokens anywhere in the JSON payload (including Character prompts). Replaces '\\\(' and '\\\)' to '(' and ')'.|
| **Set your wildcards txt files** | Upload `.txt` wildcards. Files are not sent anywhere, just stored in local storage. Files can be added and deleted at extension menu.|
| **Prompt replacement** | Converts lines to NovelAI’s original dynamic prompting syntax. |
| **Supports Autocomplete** | Detects `__`  on text area, then autocompletes from your Wildcards txt files list. Autocomplete can be select via "space", "enter", "tab". ("enter" and "tab" key collides with NAI's own autocomplete, so "space" recommended)|
| **Zero external calls** | All data lives in Chrome Storage; nothing ever leaves your browser. |

---

## 🖼️ Screenshot
![image](https://github.com/user-attachments/assets/f5b5217a-b108-4023-b0ad-f8408656b4aa)![image](https://github.com/user-attachments/assets/7bae13dd-03f1-4fb9-86a9-c2bb9af79a93)
  
![ss](https://github.com/user-attachments/assets/3f67ae5c-43e3-48d0-b446-acb3781757c1)  
![ss2](https://github.com/user-attachments/assets/763a5d89-c578-47aa-a617-be212cca022a)  


## How to install
**1. Prepare the Files**  
[Download the ZIP](https://github.com/david419kr/wildcards-for-novelai-diffusion/archive/refs/heads/main.zip) and extract the archive.  
A folder named something like "wildcards-for-novelai-diffusion-main" will appear.  
Tip: Make sure manifest.json is visible directly inside this folder—not nested in another sub‑folder.  

[ZIPをDL](https://github.com/david419kr/wildcards-for-novelai-diffusion/archive/refs/heads/main.zip)して、解凍してください。  
wildcards-for-novelai-diffusion-mainという風にフォルダーが生成されるはずです。  
フォルダーを開けてすぐ、manifest.jsonが見える状態であることを確認してください。（フォルダーの中にまたサブフォルダーがある状態ではないこと）  

**2. Chrome Settings**  
In the address bar, type chrome://extensions and press Enter. 
Toggle Developer mode (top‑right corner) to ON.  
Load the unpacked extension above.  
You should now see “Wildcards for NovelAI Diffusion 4.0” in the list, with a toggle switch on.  

Chromeのアドレスバーに、chrome://extensionsと入力し入ります。  
右上のデベロッパーモードをONにします。  
上で解凍したフォルダーを読み込みます。  
"Wildcards for NovelAI Diffusion 4.0"がリストに現れる筈です。スイッチがONになっていることを確認してください。  
  
That's it!  
Now you can manage your wildcards txt files at extension menu, then use wildcards in NovelAI as a1111 webui.  
Just make sure you refresh novelai.net page before first using the extension, if novelai.net is already open.  

これで準備OKです！  
拡張機能のアイコンをクリックしてWildcardsのtxtファイルを管理できます。  
拡張機能を入れてから初回起動時のみ、念のためNAIのページを一回リロードしてから使ってください。
