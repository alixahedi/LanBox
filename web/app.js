document.addEventListener("DOMContentLoaded", () => {

// Elements
const themeToggle = document.getElementById("themeToggle");
const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const selectBtn = document.getElementById("selectBtn");
const uploadStatus = document.getElementById("uploadStatus");
const fileList = document.getElementById("fileList");
const noteInput = document.getElementById("noteInput");
const addNoteBtn = document.getElementById("addNoteBtn");
const notesGrid = document.getElementById("notesGrid");
const toast = document.getElementById("toast");

let filesHash = "";
let notesHash = "";

function hashData(data){
    return JSON.stringify(data);
}

// Toast
function showToast(message,type="info"){
    toast.textContent = message;
    toast.className = `toast ${type} show`;

    clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(()=>{
        toast.className="toast";
    },2500);
}

// Theme
function setTheme(theme){
    document.documentElement.setAttribute("data-theme",theme);
    localStorage.setItem("lanbox-theme",theme);
    themeToggle.textContent = theme === "dark" ? "🌙" : "☀️";
    themeToggle.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    themeToggle.setAttribute("title", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
}

function initTheme(){
    const saved = localStorage.getItem("lanbox-theme") || "dark";
    setTheme(saved);
}

themeToggle.addEventListener("click",()=>{
    const current=document.documentElement.getAttribute("data-theme");
    setTheme(current==="dark"?"light":"dark");
});

// Upload (mobile-safe)
selectBtn.addEventListener("click",(e)=>{
    e.stopPropagation();
    fileInput.click();
});

fileInput.addEventListener("change",(e)=>{
    const file=e.target.files?.[0];
    if(file) uploadFile(file);
    fileInput.value="";
});

dropZone.addEventListener("dragover",(e)=>{
    e.preventDefault();
    dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave",()=>{
    dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop",(e)=>{
    e.preventDefault();
    dropZone.classList.remove("dragover");

    const file=e.dataTransfer.files?.[0];
    if(file) uploadFile(file);
});

async function uploadFile(file){

    uploadStatus.textContent=`Uploading ${file.name}...`;

    const formData=new FormData();
    formData.append("file",file);

    try{

        const res=await fetch("/api/upload",{ method:"POST", body:formData });
        const data=await res.json();

        if(!res.ok) throw new Error(data.error || "Upload failed");

        uploadStatus.textContent="Upload complete ✅";
        showToast("File uploaded","success");

        loadFiles();

    }catch(err){
        uploadStatus.textContent="";
        showToast(err.message,"error");
    }
}

// FILES
async function loadFiles(){
    const res=await fetch("/api/files");
    const files=await res.json();

    filesHash=hashData(files);
    renderFiles(files);
}

function renderFiles(files){

    fileList.innerHTML="";

    if(!files.length){
        fileList.innerHTML=`<div class="fileItem">No files uploaded yet</div>`;
        return;
    }

    files.forEach(file=>{

        const item=document.createElement("div");
        item.className="fileItem";

        item.innerHTML=`
        <div class="fileMeta">
            <span class="fileName">${file.name}</span>
            <span class="fileSize">${formatBytes(file.size || 0)}</span>
        </div>
        <div class="fileActions">
            <a class="actionBtn" href="/download/${encodeURIComponent(file.name)}" target="_blank">Download</a>
            <button class="actionBtn deleteBtn" data-name="${file.name}">Delete</button>
        </div>
        `;

        fileList.appendChild(item);
    });

    document.querySelectorAll(".deleteBtn").forEach(btn=>{
        btn.addEventListener("click",()=>deleteFile(btn.dataset.name));
    });
}

async function deleteFile(filename){
    await fetch("/api/delete-file",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({filename})
    });

    showToast("File deleted","success");
    loadFiles();
}

function formatBytes(bytes){
    if(!bytes) return "0 B";
    const sizes=["B","KB","MB","GB"];
    const i=Math.floor(Math.log(bytes)/Math.log(1024));
    return `${(bytes/Math.pow(1024,i)).toFixed(1)} ${sizes[i]}`;
}

// NOTES
addNoteBtn.addEventListener("click",addNote);

async function addNote(){

    const text=noteInput.value.trim();
    if(!text) return;

    await fetch("/api/notes/add",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({text})
    });

    noteInput.value="";
    showToast("Note added","success");
    loadNotes();
}

async function loadNotes(){
    const res=await fetch("/api/notes");
    const notes=await res.json();

    notesHash=hashData(notes);
    renderNotes(notes);
}

function renderNotes(notes){

    notesGrid.innerHTML="";

    if(!notes.length){
        notesGrid.innerHTML=`<div class="noteItem">No notes yet</div>`;
        return;
    }

    notes.forEach(note=>{

        const item=document.createElement("div");
        item.className="noteItem";

        item.innerHTML=`
        <p class="noteText">${note.text}</p>

        <div class="noteActions">
            <button class="actionBtn copyBtn" data-text="${encodeURIComponent(note.text)}">Copy</button>
            <button class="actionBtn deleteBtn" data-id="${note.id}">Delete</button>
        </div>
        `;

        notesGrid.appendChild(item);
    });

    document.querySelectorAll(".copyBtn").forEach(btn=>{
        btn.addEventListener("click",()=>{
            const text = decodeURIComponent(btn.dataset.text);
            navigator.clipboard.writeText(text);
            showToast("Copied","success");
        });
    });

    document.querySelectorAll(".deleteBtn").forEach(btn=>{
        btn.addEventListener("click",()=>deleteNote(btn.dataset.id));
    });

}

async function deleteNote(id){

    await fetch("/api/notes/delete",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({id})
    });

    showToast("Note deleted","success");
    loadNotes();
}

// LIVE UPDATE
async function pollUpdates(){

    try{

        const f=await fetch("/api/files");
        const files=await f.json();
        const newFilesHash=hashData(files);

        if(newFilesHash!==filesHash){
            filesHash=newFilesHash;
            renderFiles(files);
        }

        const n=await fetch("/api/notes");
        const notes=await n.json();
        const newNotesHash=hashData(notes);

        if(newNotesHash!==notesHash){
            notesHash=newNotesHash;
            renderNotes(notes);
        }

    }catch(e){
        console.error("Polling error",e);
    }
}

setInterval(pollUpdates,2000);

// INIT
initTheme();
loadFiles();
loadNotes();

});
