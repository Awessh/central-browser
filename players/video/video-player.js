const api=window.browserAPI;

const video=document.getElementById("video");

const playPause=document.getElementById("playPause");
const stop=document.getElementById("stop");
const progress=document.getElementById("progress");
const currentTime=document.getElementById("currentTime");
const duration=document.getElementById("duration");
const volume=document.getElementById("volume");
const mute=document.getElementById("mute");
const fullscreen=document.getElementById("fullscreen");

const back10=document.getElementById("back10");
const forward10=document.getElementById("forward10");

const prevBtn=document.getElementById("prevBtn");
const nextBtn=document.getElementById("nextBtn");

const speed=document.getElementById("speed");
const repeat=document.getElementById("repeat");
const autoplayNextBtn=document.getElementById("autoplayNext");

const pip=document.getElementById("pip");
const controls=document.getElementById("controls");

const emptyState=document.getElementById("empty-state");
const topbar=document.getElementById("topbar");
const filenameLabel=document.getElementById("filename");
const openFileBtn=document.getElementById("openFile");
const openFileTopBtn=document.getElementById("openFileTop");
const convertingOverlay=document.getElementById("converting-overlay");
const resumeToast=document.getElementById("resume-toast");

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

function showConverting(show){

    convertingOverlay.classList.toggle("hidden", !show);

}

function showResumeToast(text){

    resumeToast.textContent=text;

    resumeToast.classList.remove("hidden");

    clearTimeout(showResumeToast._t);

    showResumeToast._t=setTimeout(()=>resumeToast.classList.add("hidden"), 3000);

}

// ============================================================
// Lecture d'un fichier (point d'entrée unique)
// ============================================================

async function playPath(filePath){

    if(!filePath)return;

    showConverting(true);

    const res=await api.playMediaItem("video", filePath);

    showConverting(false);

    if(!res || res.error){

        alert("Impossible de lire ce fichier"+(res && res.message ? " : "+res.message : "")+".");

        return;

    }

    currentPath=res.path;
    pendingResume=res.resumeAt || 0;
    resumeHandled=false;

    video.src=res.url;

    video.load();

    filenameLabel.textContent=res.title;

    emptyState.classList.add("hidden");

    topbar.classList.add("visible");

    video.play().catch(()=>{});

    persistPosition();

    // Rafraîchit la playlist au cas où ce fichier vient d'y être ajouté
    if(!library.videoPlaylist.some((it)=>it.path===filePath)){

        library=await api.getMediaLibrary();

        renderPlaylist();

    }

    highlightCurrent();

}

async function chooseAndPlay(){

    const res=await api.chooseMediaFile("video");

    if(!res || !res.paths || !res.paths.length)return;

    library=await api.getMediaLibrary();

    renderPlaylist();

    playPath(res.paths[0]);

}

async function chooseAndPlayFolder(){

    const res=await api.chooseMediaFolder("video");

    if(res===null)return; // boîte de dialogue annulée

    if(!res.paths || !res.paths.length){

        alert("Aucun fichier vidéo trouvé dans ce dossier.");

        return;

    }

    library=await api.getMediaLibrary();

    renderPlaylist();

    if(!currentPath)playPath(res.paths[0]);

}

openFileBtn.onclick=chooseAndPlay;
openFileTopBtn.onclick=chooseAndPlay;
loadFolderBtn.onclick=chooseAndPlayFolder;
if(loadFolderEmptyBtn)loadFolderEmptyBtn.onclick=chooseAndPlayFolder;

// ============================================================
// Précédent / Suivant / Lecture automatique
// ============================================================

function currentPlaylistIndex(){

    return library.videoPlaylist.findIndex((it)=>it.path===currentPath);

}

function playNext(){

    const idx=currentPlaylistIndex();

    if(idx===-1)return;

    const next=library.videoPlaylist[idx+1];

    if(next)playPath(next.path);

}

function playPrevious(){

    const idx=currentPlaylistIndex();

    if(idx===-1)return;

    const prev=library.videoPlaylist[idx-1];

    if(prev)playPath(prev.path);

}

nextBtn.onclick=playNext;
prevBtn.onclick=playPrevious;

autoplayNextBtn.onclick=()=>{

    autoplayNext=!autoplayNext;

    autoplayNextBtn.classList.toggle("active", autoplayNext);

};

video.addEventListener("ended",()=>{

    persistPosition();

    if(video.loop)return; // "Répéter" gère déjà la boucle sur l'élément courant

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

function thumbHtml(item){

    if(item.thumbnail){

        return `<img class="thumb" src="${item.thumbnail}" data-thumb-for="${item.id}">`;

    }

    return `<div class="thumb-placeholder" data-thumb-for="${item.id}">🎬</div>`;

}

function renderPlaylist(){

    const list=library.videoPlaylist;

    playlistEmptyHint.classList.toggle("hidden", list.length>0);

    playlistList.innerHTML=list.map((item)=>`
        <li class="media-item${item.path===currentPath ? " playing" : ""}" draggable="true" data-id="${item.id}" data-path="${encodeURIComponent(item.path)}">
            ${thumbHtml(item)}
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

    const list=library.history.filter((h)=>h.type==="video");

    historyEmptyHint.classList.toggle("hidden", list.length>0);

    historyList.innerHTML=list.map((item)=>{

        const pct=item.duration ? Math.min(100, Math.round((item.position/item.duration)*100)) : 0;

        return `
        <li class="media-item" data-id="${item.id}" data-path="${encodeURIComponent(item.path)}">
            <div class="thumb-placeholder">🎬</div>
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

function escapeHtml(str){

    const div=document.createElement("div");

    div.textContent=str || "";

    return div.innerHTML;

}

function highlightCurrent(){

    document.querySelectorAll("#playlist-list .media-item").forEach((el)=>{

        const isPlaying=decodeURIComponent(el.dataset.path)===currentPath;

        el.classList.toggle("playing", isPlaying);

        const meta=el.querySelector(".meta");

        if(meta)meta.textContent=isPlaying ? "▶ En cours de lecture" : "Dans la playlist";

    });

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

            library.videoPlaylist=await api.removeMediaItem("video", id);

            renderPlaylist();

            if(wasPlaying)clearPlayer();

        });

        // Réordonnancement par glisser-déposer
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

            const ids=library.videoPlaylist.map((it)=>it.id);

            const from=ids.indexOf(draggedId);
            const to=ids.indexOf(el.dataset.id);

            if(from===-1 || to===-1)return;

            ids.splice(to, 0, ids.splice(from, 1)[0]);

            library.videoPlaylist=await api.reorderMediaPlaylist("video", ids);

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

    const res=await api.chooseMediaFile("video");

    if(!res || !res.paths || !res.paths.length)return;

    library=await api.getMediaLibrary();

    renderPlaylist();

    if(!currentPath)playPath(res.paths[0]);

};

clearPlaylistBtn.onclick=async ()=>{

    if(!confirm("Vider toute la playlist vidéo ?"))return;

    library.videoPlaylist=await api.clearMediaPlaylist("video");

    renderPlaylist();

    clearPlayer();

};

clearHistoryBtn.onclick=async ()=>{

    if(!confirm("Effacer tout l'historique de lecture ?"))return;

    library.history=await api.clearMediaHistory();

    renderHistory();

};

api.onThumbnailReady(({id, thumbnail})=>{

    const item=library.videoPlaylist.find((it)=>it.id===id);

    if(item)item.thumbnail=thumbnail;

    const img=document.querySelector(`[data-thumb-for="${id}"]`);

    if(img && img.tagName==="IMG")img.src=thumbnail;

    else renderPlaylist();

});

// ============================================================
// Barre latérale : onglets + affichage/masquage
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
// Glisser-déposer de fichiers externes sur le lecteur
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

    // Chaque élément déposé peut être un fichier vidéo isolé ou un dossier
    // complet : le processus principal scanne les dossiers récursivement et
    // n'en garde que les vidéos qu'ils contiennent.
    const res=await api.addMediaPaths("video", paths);

    if(!res || !res.added || !res.added.length)return;

    library.videoPlaylist=res.playlist;

    renderPlaylist();

    playPath(res.added[0]);

});

// ============================================================
// Chargement d'un fichier demandé depuis le processus principal
// (menu "Lecteur vidéo", téléchargement, association de fichier...)
// ============================================================

api.onLoadVideo((filePath)=>{

    playPath(filePath);

});

// ============================================================
// Reprise de position + sauvegarde périodique
// ============================================================

video.addEventListener("loadedmetadata",()=>{

    duration.innerHTML=format(video.duration);

    if(pendingResume && !resumeHandled){

        video.currentTime=pendingResume;

        showResumeToast("Reprise à "+format(pendingResume));

    }

    resumeHandled=true;

    persistPosition();

});

function persistPosition(){

    if(!currentPath || !video.duration)return;

    api.saveMediaPosition("video", currentPath, video.currentTime, video.duration);

}

setInterval(()=>{

    if(!video.paused)persistPosition();

}, 5000);

video.addEventListener("pause", persistPosition);

window.addEventListener("beforeunload", persistPosition);

// ============================================================
// Contrôles de lecture standards
// ============================================================

back10.onclick=()=>video.currentTime-=10;

forward10.onclick=()=>video.currentTime+=10;

speed.onchange=()=>{

    video.playbackRate=Number(speed.value);

};

let hideTimer;

function showControls(){

    controls.style.opacity=1;

    topbar.classList.add("visible");

    clearTimeout(hideTimer);

    hideTimer=setTimeout(()=>{

        if(!video.paused){

            controls.style.opacity=0;

            topbar.classList.remove("visible");

        }

    },3000);

}

document.getElementById("main").addEventListener("mousemove", showControls);

video.onplay=showControls;

video.onpause=()=>{

    controls.style.opacity=1;

    topbar.classList.add("visible");

};

repeat.onclick=()=>{

    video.loop=!video.loop;

    repeat.classList.toggle("active-loop", video.loop);

};

pip.onclick=async ()=>{

    try{

        if(document.pictureInPictureElement){

            await document.exitPictureInPicture();

        }else{

            await video.requestPictureInPicture();

        }

    }catch(e){

        console.log(e);

    }

};

playPause.onclick=()=>{

    if(video.paused)video.play();
    else video.pause();

};

video.addEventListener("play",()=>{

    playPause.innerHTML='<i class="fa-solid fa-pause"></i>';

});

video.addEventListener("pause",()=>{

    playPause.innerHTML='<i class="fa-solid fa-play"></i>';

});

// Vide complètement le lecteur (utilisé par "Stop", et quand le fichier en
// cours de lecture disparaît de la playlist, par exemple lors d'un retrait
// ou d'un "Vider" complet). La lecture dépend toujours de la playlist.
function clearPlayer(){

    video.pause();

    video.removeAttribute("src");

    video.load();

    currentPath=null;
    pendingResume=0;
    resumeHandled=false;

    filenameLabel.textContent="";

    topbar.classList.remove("visible");

    emptyState.classList.remove("hidden");

    currentTime.innerHTML="00:00";
    duration.innerHTML="00:00";
    progress.value=0;

    controls.style.opacity=1;

    highlightCurrent();

}

stop.onclick=()=>{

    video.pause();

    clearPlayer();

};

volume.oninput=()=>{

    video.volume=volume.value/100;

};

mute.onclick=()=>{

    video.muted=!video.muted;

    mute.innerHTML=video.muted ? '<i class="fa-solid fa-volume-xmark"></i>':'<i class="fa-solid fa-volume"></i>';

};

video.addEventListener("timeupdate",()=>{

    currentTime.innerHTML=format(video.currentTime);

    progress.value=(video.currentTime/video.duration)*100 || 0;

});

video.addEventListener("error",()=>{

    if(video.src)alert("Impossible de lire ce fichier vidéo.");

});

video.ondblclick=()=>{

    fullscreen.click();

};

progress.oninput=()=>{

    video.currentTime=(progress.value/100)*video.duration;

};

fullscreen.onclick=()=>{

    if(document.fullscreenElement)document.exitFullscreen();
    else document.documentElement.requestFullscreen();

};

document.addEventListener("keydown",(e)=>{

    if(e.target.tagName==="INPUT")return;

    switch(e.code){

        case "Space":

            e.preventDefault();

            playPause.click();

            break;

        case "ArrowLeft":

            video.currentTime-=5;

            break;

        case "ArrowRight":

            video.currentTime+=5;

            break;

        case "KeyM":

            mute.click();

            break;

        case "KeyF":

            fullscreen.click();

            break;

        case "KeyP":

            pip.click();

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