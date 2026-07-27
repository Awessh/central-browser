const api=window.browserAPI;

const audio=document.getElementById("audio");

const playPause=document.getElementById("playPause");
const stop=document.getElementById("stop");
const progress=document.getElementById("progress");
const currentTime=document.getElementById("currentTime");
const duration=document.getElementById("duration");
const volume=document.getElementById("volume");
const mute=document.getElementById("mute");
const back5=document.getElementById("back5");
const forward5=document.getElementById("forward5");
const speed=document.getElementById("speed");
const repeat=document.getElementById("repeat");
const autoplayNextBtn=document.getElementById("autoplayNext");
const prevBtn=document.getElementById("prevBtn");
const nextBtn=document.getElementById("nextBtn");

const filenameLabel=document.getElementById("filename");
const emptyActions=document.getElementById("empty-actions");
const controls=document.getElementById("controls");
const cover=document.getElementById("cover");
const openFileBtn=document.getElementById("openFile");
const openFileBottomBtn=document.getElementById("openFileBottom");

const sidebar=document.getElementById("sidebar");
const sidebarToggle=document.getElementById("sidebarToggle");
const tabBtns=document.querySelectorAll(".tab-btn");
const playlistPanel=document.getElementById("playlist-panel");
const historyPanel=document.getElementById("history-panel");
const playlistList=document.getElementById("playlist-list");
const historyList=document.getElementById("history-list");
const playlistEmptyHint=document.getElementById("playlist-empty");
const historyEmptyHint=document.getElementById("history-empty");
const addFilesBtn=document.getElementById("addFiles");
const loadFolderBtn=document.getElementById("loadFolder");
const loadFolderEmptyBtn=document.getElementById("loadFolderEmpty");
const clearPlaylistBtn=document.getElementById("clearPlaylist");
const clearHistoryBtn=document.getElementById("clearHistory");

let library={ videoPlaylist:[], audioPlaylist:[], history:[] };
let currentPath=null;
let pendingResume=0;
let resumeHandled=false;
let autoplayNext=true;

// ============================================================
// Utilitaires
// ============================================================

function format(sec){

    sec=Math.floor(sec)||0;

    let h=Math.floor(sec/3600);
    let m=Math.floor((sec%3600)/60);
    let s=sec%60;

    if(h>0) return String(h).padStart(2,"0")+":"+String(m).padStart(2,"0")+":"+String(s).padStart(2,"0");

    return String(m).padStart(2,"0")+":"+String(s).padStart(2,"0");

}

function timeAgo(ts){

    if(!ts)return "";

    const diff=Math.floor((Date.now()-ts)/1000);

    if(diff<60)return "à l'instant";
    if(diff<3600)return Math.floor(diff/60)+" min";
    if(diff<86400)return Math.floor(diff/3600)+" h";

    return Math.floor(diff/86400)+" j";

}

function escapeHtml(str){

    const div=document.createElement("div");

    div.textContent=str || "";

    return div.innerHTML;

}

// ============================================================
// Lecture d'un fichier (point d'entrée unique)
// ============================================================

async function playPath(filePath){

    if(!filePath)return;

    const res=await api.playMediaItem("audio", filePath);

    if(!res || res.error){

        alert("Impossible de lire ce fichier"+(res && res.message ? " : "+res.message : "")+".");

        return;

    }

    currentPath=res.path;
    pendingResume=res.resumeAt || 0;
    resumeHandled=false;

    audio.src=res.url;

    audio.load();

    filenameLabel.textContent=res.title;

    emptyActions.classList.add("hidden");
    controls.classList.add("visible");

    audio.play().catch(()=>{});

    if(!library.audioPlaylist.some((it)=>it.path===filePath)){

        library=await api.getMediaLibrary();

        renderPlaylist();

    }

    highlightCurrent();

}

async function chooseAndPlay(){

    const res=await api.chooseMediaFile("audio");

    if(!res || !res.paths || !res.paths.length)return;

    library=await api.getMediaLibrary();

    renderPlaylist();

    playPath(res.paths[0]);

}

async function chooseAndPlayFolder(){

    const res=await api.chooseMediaFolder("audio");

    if(res===null)return; // boîte de dialogue annulée

    if(!res.paths || !res.paths.length){

        alert("Aucun fichier audio trouvé dans ce dossier.");

        return;

    }

    library=await api.getMediaLibrary();

    renderPlaylist();

    if(!currentPath)playPath(res.paths[0]);

}

openFileBtn.onclick=chooseAndPlay;
openFileBottomBtn.onclick=chooseAndPlay;
loadFolderBtn.onclick=chooseAndPlayFolder;
if(loadFolderEmptyBtn)loadFolderEmptyBtn.onclick=chooseAndPlayFolder;

// ============================================================
// Précédent / Suivant / Lecture automatique
// ============================================================

function currentPlaylistIndex(){

    return library.audioPlaylist.findIndex((it)=>it.path===currentPath);

}

function playNext(){

    const idx=currentPlaylistIndex();

    if(idx===-1)return;

    const next=library.audioPlaylist[idx+1];

    if(next)playPath(next.path);

}

function playPrevious(){

    const idx=currentPlaylistIndex();

    if(idx===-1)return;

    const prev=library.audioPlaylist[idx-1];

    if(prev)playPath(prev.path);

}

nextBtn.onclick=playNext;
prevBtn.onclick=playPrevious;

autoplayNextBtn.onclick=()=>{

    autoplayNext=!autoplayNext;

    autoplayNextBtn.classList.toggle("active", autoplayNext);

};

audio.addEventListener("ended",()=>{

    persistPosition();

    if(audio.loop)return;

    if(autoplayNext)playNext();

});

// ============================================================
// Playlist / historique — chargement + rendu
// ============================================================

async function loadLibrary(){

    library=await api.getMediaLibrary();

    renderPlaylist();
    renderHistory();

}

function renderPlaylist(){

    const list=library.audioPlaylist;

    playlistEmptyHint.classList.toggle("hidden", list.length>0);

    playlistList.innerHTML=list.map((item)=>`
        <li class="media-item${item.path===currentPath ? " playing" : ""}" draggable="true" data-id="${item.id}" data-path="${encodeURIComponent(item.path)}">
            <div class="thumb-placeholder">🎵</div>
            <div class="info">
                <div class="title">${escapeHtml(item.title)}</div>
                <div class="meta">${item.path===currentPath ? "▶ En cours de lecture" : "Dans la playlist"}</div>
            </div>
            <button class="remove" title="Retirer de la playlist">✕</button>
        </li>
    `).join("");

    attachPlaylistEvents();

}

function renderHistory(){

    const list=library.history.filter((h)=>h.type==="audio");

    historyEmptyHint.classList.toggle("hidden", list.length>0);

    historyList.innerHTML=list.map((item)=>{

        const pct=item.duration ? Math.min(100, Math.round((item.position/item.duration)*100)) : 0;

        return `
        <li class="media-item" data-id="${item.id}" data-path="${encodeURIComponent(item.path)}">
            <div class="thumb-placeholder">🎵</div>
            <div class="info">
                <div class="title">${escapeHtml(item.title)}</div>
                <div class="meta">Lu il y a ${timeAgo(item.lastPlayedAt)}${pct ? " • "+pct+"%" : ""}</div>
                ${pct ? `<div class="mini-progress"><div class="mini-progress-fill" style="width:${pct}%"></div></div>` : ""}
            </div>
            <button class="remove" title="Retirer de l'historique">✕</button>
        </li>
    `;}).join("");

    attachHistoryEvents();

}

function highlightCurrent(){

    document.querySelectorAll("#playlist-list .media-item").forEach((el)=>{

        const isPlaying=decodeURIComponent(el.dataset.path)===currentPath;

        el.classList.toggle("playing", isPlaying);

        const meta=el.querySelector(".meta");

        if(meta)meta.textContent=isPlaying ? "▶ En cours de lecture" : "Dans la playlist";

    });

    cover.classList.toggle("playing", !!currentPath);

}

function attachPlaylistEvents(){

    playlistList.querySelectorAll(".media-item").forEach((el)=>{

        const path=decodeURIComponent(el.dataset.path);

        el.addEventListener("click",(e)=>{

            if(e.target.closest(".remove"))return;

            playPath(path);

        });

        el.querySelector(".remove").addEventListener("click", async (e)=>{

            e.stopPropagation();

            const id=el.dataset.id;
            const wasPlaying=path===currentPath;

            library.audioPlaylist=await api.removeMediaItem("audio", id);

            renderPlaylist();

            if(wasPlaying)clearPlayer();

        });

        el.addEventListener("dragstart",(e)=>{

            e.dataTransfer.setData("text/plain", el.dataset.id);

        });

        el.addEventListener("dragover",(e)=>{

            e.preventDefault();

            el.classList.add("drag-over");

        });

        el.addEventListener("dragleave",()=>el.classList.remove("drag-over"));

        el.addEventListener("drop", async (e)=>{

            e.preventDefault();

            e.stopPropagation();

            el.classList.remove("drag-over");

            const draggedId=e.dataTransfer.getData("text/plain");

            if(!draggedId || draggedId===el.dataset.id)return;

            const ids=library.audioPlaylist.map((it)=>it.id);

            const from=ids.indexOf(draggedId);
            const to=ids.indexOf(el.dataset.id);

            if(from===-1 || to===-1)return;

            ids.splice(to, 0, ids.splice(from, 1)[0]);

            library.audioPlaylist=await api.reorderMediaPlaylist("audio", ids);

            renderPlaylist();

        });

    });

}

function attachHistoryEvents(){

    historyList.querySelectorAll(".media-item").forEach((el)=>{

        const path=decodeURIComponent(el.dataset.path);

        el.addEventListener("click",(e)=>{

            if(e.target.closest(".remove"))return;

            playPath(path);

        });

        el.querySelector(".remove").addEventListener("click", async (e)=>{

            e.stopPropagation();

            library.history=await api.removeMediaHistoryItem(el.dataset.id);

            renderHistory();

        });

    });

}

addFilesBtn.onclick=async ()=>{

    const res=await api.chooseMediaFile("audio");

    if(!res || !res.paths || !res.paths.length)return;

    library=await api.getMediaLibrary();

    renderPlaylist();

    if(!currentPath)playPath(res.paths[0]);

};

clearPlaylistBtn.onclick=async ()=>{

    if(!confirm("Vider toute la playlist audio ?"))return;

    library.audioPlaylist=await api.clearMediaPlaylist("audio");

    renderPlaylist();

    clearPlayer();

};

clearHistoryBtn.onclick=async ()=>{

    if(!confirm("Effacer tout l'historique de lecture ?"))return;

    library.history=await api.clearMediaHistory();

    renderHistory();

};

// ============================================================
// Onglets barre latérale
// ============================================================

tabBtns.forEach((btn)=>{

    btn.addEventListener("click",()=>{

        tabBtns.forEach((b)=>b.classList.remove("active"));

        btn.classList.add("active");

        const tab=btn.dataset.tab;

        playlistPanel.classList.toggle("active", tab==="playlist");
        historyPanel.classList.toggle("active", tab==="history");

});

});

sidebarToggle.onclick=()=>{

    sidebar.classList.toggle("collapsed");

};

// ============================================================
// Glisser-déposer de fichiers externes
// ============================================================

document.addEventListener("dragover",(e)=>{

    e.preventDefault();

});

document.addEventListener("drop", async (e)=>{

    e.preventDefault();

    const files=Array.from(e.dataTransfer.files || []);

    if(!files.length)return;

    const paths=files.map((f)=>f.path).filter(Boolean);

    if(!paths.length)return;

    // Chaque élément déposé peut être un fichier audio isolé ou un dossier
    // complet : le processus principal scanne les dossiers récursivement et
    // n'en garde que les fichiers audio qu'ils contiennent.
    const res=await api.addMediaPaths("audio", paths);

    if(!res || !res.added || !res.added.length)return;

    library.audioPlaylist=res.playlist;

    renderPlaylist();

    playPath(res.added[0]);

});

// ============================================================
// Chargement depuis le processus principal
// ============================================================

api.onLoadAudio((filePath)=>{

    playPath(filePath);

});

// ============================================================
// Reprise de position + sauvegarde périodique
// ============================================================

audio.addEventListener("loadedmetadata",()=>{

    duration.innerHTML=format(audio.duration);

    if(pendingResume && !resumeHandled){

        audio.currentTime=pendingResume;

    }

    resumeHandled=true;

    persistPosition();

});

function persistPosition(){

    if(!currentPath || !audio.duration)return;

    api.saveMediaPosition("audio", currentPath, audio.currentTime, audio.duration);

    }

setInterval(()=>{

    if(!audio.paused)persistPosition();

}, 5000);

audio.addEventListener("pause", persistPosition);

window.addEventListener("beforeunload", persistPosition);

// ============================================================
// Contrôles standards
// ============================================================

playPause.onclick=()=>{

    if(audio.paused)audio.play();
    else audio.pause();

};

audio.addEventListener("play",()=>{

    playPause.innerHTML='<i class="fa-solid fa-pause"></i>';

    cover.classList.add("playing");

});

audio.addEventListener("pause",()=>{

    playPause.innerHTML='<i class="fa-solid fa-play"></i>';

    cover.classList.remove("playing");

});

// Vide complètement le lecteur (utilisé par "Stop", et quand le fichier en
// cours de lecture disparaît de la playlist). La lecture dépend toujours
// de la playlist.
function clearPlayer(){

    audio.pause();

    audio.removeAttribute("src");

    audio.load();

    currentPath=null;
    pendingResume=0;
    resumeHandled=false;

    filenameLabel.textContent="Aucun fichier chargé";

    emptyActions.classList.remove("hidden");

    controls.classList.remove("visible");

    currentTime.innerHTML="00:00";
    duration.innerHTML="00:00";
    progress.value=0;

    cover.classList.remove("playing");

    highlightCurrent();

}

stop.onclick=()=>{

    audio.pause();

    clearPlayer();

};

back5.onclick=()=>audio.currentTime-=5;

forward5.onclick=()=>audio.currentTime+=5;

speed.onchange=()=>{

    audio.playbackRate=Number(speed.value);

};

repeat.onclick=()=>{

    audio.loop=!audio.loop;

    repeat.style.background=audio.loop ? "#2ecc71" : "#333";

};

volume.oninput=()=>{

    audio.volume=volume.value/100;

};

mute.onclick=()=>{

    audio.muted=!audio.muted;

    mute.innerHTML=audio.muted ? '<i class="fa-solid fa-volume-xmark"></i>' : '<i class="fa-solid fa-volume"></i>';

};

audio.addEventListener("timeupdate",()=>{

    currentTime.innerHTML=format(audio.currentTime);

    progress.value=(audio.currentTime/audio.duration)*100 || 0;

});

audio.addEventListener("error",()=>{

    if(audio.src)alert("Impossible de lire ce fichier audio.");

});

progress.oninput=()=>{

    audio.currentTime=(progress.value/100)*audio.duration;

};

document.addEventListener("keydown",(e)=>{

    if(e.target.tagName==="INPUT")return;

    switch(e.code){

        case "Space":

            e.preventDefault();

            playPause.click();

            break;

        case "ArrowLeft":

            audio.currentTime-=5;

            break;

        case "ArrowRight":

            audio.currentTime+=5;

            break;

        case "KeyM":

            mute.click();

            break;

        case "KeyN":

            playNext();

            break;

        case "KeyB":

            playPrevious();

            break;

    }

});

// ============================================================
// Démarrage
// ============================================================

loadLibrary();
