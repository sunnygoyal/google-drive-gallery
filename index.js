const CARD_WIDTH = 180;
const CARD_HEIGHT = 120;
const OPEN_SIZE = 800;
const ROOT_DIR = "1Qnci2JnzbKdjA7l9ZSRvfp8oyBQ3nDzA";

function CancelSignal() {
    this.cancelled = false;
}
CancelSignal.prototype.cancel = function() {
    this.cancelled = true;
}
CancelSignal.prototype.throwIsCancelled = function() {
    if (this.cancelled) {
        throw "Request cancelled";
    }
}

var currentRenderPath = null;
var currentRenderItems = [];
var activeRequest = new CancelSignal();
var cachedData = {};

async function fetchFileList(folderId) {
    // Cancel old request
    activeRequest.cancel();
    if (cachedData[folderId]) {
        return cachedData[folderId];
    }

    $("#image-list .card").remove();
    if ($("#image-list .loader").length == 0) {
        $("<div class=loader />").appendTo("#image-list");
    }
    currentRenderPath = null;

    let myRequest = new CancelSignal();
    activeRequest = myRequest;

    let url = `https://www.googleapis.com/drive/v2/files?q=%27${folderId}%27+in+parents&key=AIzaSyCb2e0N8IKQ5qhARrF_rZmnuOAKkUbzOrU&fields=items(id,embedLink,downloadUrl,thumbnailLink,id,title,mimeType,imageMediaMetadata(height,width),videoMediaMetadata(width,height))`
    // let url = `https://www.googleapis.com/drive/v2/files?q=%27${folderId}%27+in+parents&key=AIzaSyCb2e0N8IKQ5qhARrF_rZmnuOAKkUbzOrU`
    let response = await fetch(url);
    if (response.status !== 200) {
        console.log('Looks like there was a problem. Status Code: ' + response.status);
        return;
    }
    myRequest.throwIsCancelled();
    let j = await response.json();
    myRequest.throwIsCancelled();
    cachedData[folderId] = j.items;
    return cachedData[folderId];
}

function renderContents(serverItems, basePath, title) {
    if (currentRenderPath == basePath) {
        return currentRenderItems;
    }
    currentRenderPath = basePath;
    $("h2").text(title);
    let items = [];

    function openPhotoSwipe() {
        var doScroll = false;

        function getThumbBoundsFn(index) {
            let item = items[index];
            let el = $(item.el);
            let pos = el.offset();

            if (doScroll && item.el.scrollIntoView) {
                if (pos.top < 0) {
                    el.get(0).scrollIntoView();
                    pos = el.offset();
                } else if ((pos.top + el.height()) > $(window).height()) {
                    el.get(0).scrollIntoView(false);
                    pos = el.offset();
                }
            }
    
            return {
                x: Math.round(pos.left + (CARD_WIDTH - item.tW) / 2),
                y: Math.round(pos.top + (CARD_HEIGHT - item.tH) / 2),
                w : item.tW
            };
        }

        var gallery;
        let options = {
            index: items.findIndex(e => e.el == this),
            galleryPIDs: true,
            getThumbBoundsFn: getThumbBoundsFn,
        };
        gallery = new PhotoSwipe( $("#photoswipe-dialog").get(0), PhotoSwipeUI_Default, items, options);
        gallery.init();
        $(".pswp__button--download").unbind("click").bind("click",
            e => window.location = gallery.currItem.downloadUrl);
        
        doScroll = true;
    }
    $("#image-list .card, #image-list .loader").remove();
    let container = $("#image-list");

    serverItems.forEach(item => {
        let w, h, scale;

        let el = $("<a class=card>").attr("title", item.title);

        if (item.imageMediaMetadata) {
            w = item.imageMediaMetadata.width;
            h = item.imageMediaMetadata.height;
            scale = Math.min(CARD_WIDTH / w, CARD_HEIGHT / h);

        } else if (item.videoMediaMetadata) {
            w = item.videoMediaMetadata.width;
            h = item.videoMediaMetadata.height;

            el.attr("href", item.embedLink).addClass("video");
            $("<label>").text(item.title).appendTo(el);

            // Some hack, not sure why
            scale = Math.min(250 / w, 140 / h);
        } else if ("application/vnd.google-apps.folder" == item.mimeType) {
            $("<label>").text(item.title).appendTo(el);
            el.appendTo(container).addClass("folder")
                .attr("href", "#fid=" + basePath + (basePath == "" ? "" : "/") + item.id);
            return;
        } else {
            console.info("ignoring item", item);
            return;
        }
        let tW = Math.round(scale * w);
        let tH = Math.round(scale * h);
        let thumbLink = item.thumbnailLink.split("=")[0] + "=w" + tW;

        el.appendTo(container).css("background-image", `url(${thumbLink})`)

        if (item.imageMediaMetadata) {
            el.click(openPhotoSwipe);
            let pW, pH;
            if (w < h) {
                pW = OPEN_SIZE;
                pH = Math.round(pW * h / w);
            } else {
                pH = OPEN_SIZE;
                pW = Math.round(pH * w / h);
            }
            items.push({
                w: pW,
                h: pH,
                src: item.thumbnailLink.split("=")[0] + "=w" + pW,
                msrc: thumbLink,

                el: el.get(0),
                downloadUrl: item.downloadUrl,

                tW: tW,
                tH: tH,
                pid: item.id,
                fileName: item.title
            });
        }
    });
    currentRenderItems = items;
    return items;
}

function parseUrlHash() {
    var hash = window.location.hash.substring(1),
    params = {};
    if(hash.length < 1) {
        return params;
    }
    var vars = hash.split('&');
    for (var i = 0; i < vars.length; i++) {
        if(!vars[i]) {
            continue;
        }
        var pair = vars[i].split('=');  
        if(pair.length < 2) {
            continue;
        }           
        params[pair[0]] = pair[1];
    }
    return params;
}

async function loadUIForUrl() {
    let hash = parseUrlHash();
    let root = await fetchFileList(ROOT_DIR);
    let currentData = root;
    let basePath = "";
    let title = "";
    if (hash.fid) {
        basePath = hash.fid;
        let paths = hash.fid.split("/");
        for (let i = 0; i < paths.length; i++) {
            // ensure that folder is present in the parent
            let subfolder = currentData.find(e => e.id == paths[i]);
            if (!subfolder) {
                console.error("Invalid folder id", paths[i]);
                window.history.replaceState({ }, null, window.location.pathname);
                renderContents(root, "", "");
                return;
            }
            title = subfolder.title;
            currentData = await fetchFileList(paths[i]);
        }
    }
    let items = renderContents(currentData, basePath, title);
    if (hash.pid) {
        let pic = items.find(e => e.pid == hash.pid);
        if (pic) {
            $(pic.el).click();
        } else {
            window.history.replaceState({ }, null,
                basePath == "" ? window.location.pathname : ("#fid=" + basePath));
        }
    }
}

$(function() {

    document.documentElement.style.setProperty('--card-width', CARD_WIDTH + "px");
    document.documentElement.style.setProperty('--card-height', CARD_HEIGHT + "px");
    loadUIForUrl();
    window.addEventListener("hashchange", loadUIForUrl);
});