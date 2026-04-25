const vscode = require('vscode');
const axios = require('axios');
const marked = require('marked');

let globalPanel = null;
let chatHistory = [];

function activate(context) {

    console.log("⚡ StackSense Activated");

    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.text = "⚡ StackSense";
    statusBar.command = "stacksense.open";
    statusBar.show();

    context.subscriptions.push(statusBar);

    const disposable = vscode.commands.registerCommand('stacksense.open', async function () {

        chatHistory = context.globalState.get("chatHistory", []);

        const editor = vscode.window.activeTextEditor;

        if (!editor) {
            vscode.window.showInformationMessage('Open a file first');
            return;
        }

        let storedCode = editor.document.getText();

        if (globalPanel) {
            globalPanel.reveal();
            return;
        }

        globalPanel = vscode.window.createWebviewPanel(
            'stacksense',
            '⚡ StackSense AI',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        globalPanel.onDidDispose(() => {
            globalPanel = null;
        });

        globalPanel.webview.html = getWebviewContent(chatHistory);

        globalPanel.webview.onDidReceiveMessage(async (message) => {

            try {

                // 🧹 RESET CHAT
                if (message.command === "resetChat") {
                    chatHistory = [];
                    context.globalState.update("chatHistory", []);

                    globalPanel.webview.postMessage({
                        type: "reset"
                    });

                    return;
                }

                if (message.isUser) {
                    chatHistory.push({ text: message.text, type: "user" });
                    context.globalState.update("chatHistory", chatHistory);
                }

                let reply = "";

                // 🧠 Analyze Code
                if (message.command === "analyzeCode") {
                    reply = await getAIResponseWithContext(
                        storedCode,
                        "Analyze this code. Find bugs, issues, improvements."
                    );
                }

                // ⚡ Complexity Analysis
                if (message.command === "complexity") {
                    const prompt = `
Analyze this code deeply.

CODE:
${storedCode}

Provide:
- Time Complexity
- Space Complexity
- Cyclomatic Complexity
- Memory Usage
- Runtime Estimate
- Optimization Suggestions
- Performance comparison (like beats %)

Be structured and clean.
`;
                    reply = await getAI(prompt);
                }

                // 💬 Chat
                if (message.command === "ask") {
                    reply = await getAIResponseWithContext(
                        storedCode,
                        message.text
                    );
                }

                chatHistory.push({ text: reply, type: "ai" });
                context.globalState.update("chatHistory", chatHistory);

                globalPanel.webview.postMessage(marked.parse(reply));

            } catch (err) {
                globalPanel.webview.postMessage("⚠️ " + err.message);
            }

        });

    });

    context.subscriptions.push(disposable);
}


// 🔥 AI CALL
async function getAI(prompt) {

    const apiKey = "Your_APIkey";

    const response = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        {
            model: "llama-3.1-8b-instant",
            messages: [{ role: "user", content: prompt }]
        },
        {
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            }
        }
    );

    return response.data.choices[0].message.content;
}


// 🧠 Context Chat
async function getAIResponseWithContext(code, question) {

    const prompt = `
You are a senior engineer.

CODE:
${code}

QUESTION:
${question}

Answer clearly and practically.
`;

    return await getAI(prompt);
}


// 🎨 UI (ONLY RESET BUTTON ADDED)
function getWebviewContent(history = []) {
    return `
<!DOCTYPE html>
<html>
<head>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>

<style>
* { margin:0; padding:0; box-sizing:border-box; }

body {
    background: radial-gradient(circle at top,#0f172a,#020617);
    font-family: 'Segoe UI';
    display:flex;
    flex-direction:column;
    height:100vh;
    color:white;
}

.header {
    padding:15px;
    font-size:18px;
    font-weight:600;
    border-bottom:1px solid rgba(255,255,255,0.1);
    background:rgba(0,0,0,0.3);
}

.chat {
    flex:1;
    overflow-y:auto;
    padding:20px;
    display:flex;
    flex-direction:column;
    gap:12px;
}

.msg {
    max-width:75%;
    padding:12px 16px;
    border-radius:14px;
    animation:fadeIn 0.3s ease;
    white-space:pre-wrap;
    line-height:1.6;
}

.user {
    align-self:flex-end;
    background:linear-gradient(135deg,#2563eb,#3b82f6);
}

.ai {
    align-self:flex-start;
    background:rgba(255,255,255,0.05);
}

.inputBar {
    display:flex;
    gap:10px;
    padding:15px;
    border-top:1px solid rgba(255,255,255,0.1);
    background:rgba(0,0,0,0.3);
}

input {
    flex:1;
    padding:12px;
    border-radius:10px;
    border:none;
    background:#020617;
    color:white;
}

button {
    padding:10px 14px;
    border:none;
    border-radius:10px;
    cursor:pointer;
    background:linear-gradient(135deg,#38bdf8,#6366f1);
    transition:0.3s;
}

button:hover {
    transform:scale(1.08);
    box-shadow:0 0 12px #38bdf8;
}

.actions {
    display:flex;
    gap:10px;
    padding:10px 15px;
}

@keyframes fadeIn {
    from {opacity:0; transform:translateY(6px);}
    to {opacity:1; transform:translateY(0);}
}

.typing span {
    width:6px;
    height:6px;
    margin:2px;
    background:#38bdf8;
    display:inline-block;
    border-radius:50%;
    animation:blink 1.4s infinite;
}

@keyframes blink {
    0%,80%,100%{opacity:0;}
    40%{opacity:1;}
}
</style>
</head>

<body>

<div class="header">⚡ StackSense AI</div>

<div class="actions">
<button onclick="analyze()">🧠 Analyze</button>
<button onclick="complexity()">⚡ Complexity</button>
<button onclick="resetChat()">🧹 Reset</button>
</div>

<div class="chat" id="chat"></div>

<div class="inputBar">
<input id="input" placeholder="Ask anything..."/>
<button onclick="ask()">Send</button>
</div>

<script>
const vscode = acquireVsCodeApi();
const oldChat = ${JSON.stringify(history)};

function addMessage(text,type){
    const d=document.createElement("div");
    d.className="msg "+type;
    d.innerHTML=text;
    chat.appendChild(d);
    chat.scrollTop=chat.scrollHeight;
}

oldChat.forEach(m=>{
    addMessage(marked.parse(m.text),m.type);
});

function typing(){
    const d=document.createElement("div");
    d.className="msg ai typing";
    d.id="typing";
    d.innerHTML="<span></span><span></span><span></span>";
    chat.appendChild(d);
}

function stopTyping(){
    const t=document.getElementById("typing");
    if(t) t.remove();
}

function ask(){
    const val=input.value;
    if(!val) return;

    addMessage(val,"user");
    typing();

    vscode.postMessage({command:"ask",text:val,isUser:true});
    input.value="";
}

function analyze(){
    addMessage("Analyze my code","user");
    typing();
    vscode.postMessage({command:"analyzeCode",text:"analyze",isUser:true});
}

function complexity(){
    addMessage("Run complexity analysis","user");
    typing();
    vscode.postMessage({command:"complexity",text:"complexity",isUser:true});
}

function resetChat(){
    vscode.postMessage({command:"resetChat"});
}

window.addEventListener('message',e=>{
    if(e.data.type === "reset"){
        chat.innerHTML = "";
        return;
    }
    stopTyping();
    addMessage(e.data,"ai");
});
</script>

</body>
</html>
`;
}

function deactivate(){}

module.exports = { activate, deactivate };

