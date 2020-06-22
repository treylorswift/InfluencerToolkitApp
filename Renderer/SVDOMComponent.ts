import {SVDOMHost} from "./SVDOMHost.js"

export class SVDOMPopupHandle
{
    handle:string;
    static count:number = 0;

    constructor()
    {
        this.handle = 'popup_'+SVDOMPopupHandle.count;
        SVDOMPopupHandle.count++;
    }
}

export abstract class SVDOMComponent
{
    parent:SVDOMComponent;
    site:SVDOMHost;

    constructor(parent:SVDOMComponent)
    {
        this.parent = parent;
        
        if (parent)
            this.site = parent.GetSite();
        else
            this.site = null;
    }

    GetSite():SVDOMHost
    {
        return this.site;
    }

    abstract async Render(em:Element):Promise<void>;

    //any listeners or watches or other external references that were established during Render
    //should be cleaned up here
    async RenderCleanup():Promise<void> {}

    MapEvent(parentElement:Element,id:string,eventName:string,memberFunction:Function)
    {
        try{
            parentElement.querySelector(`#${id}`).addEventListener(`${eventName}`, memberFunction.bind(this));
        }
        catch (err)
        {
            console.log(`MapEvent error - name: "${err.name}" message: "${err.message}`);
            console.error(err);
        }
    }

    DisplayPopupComponent(x:number,y:number,component:SVDOMComponent):SVDOMPopupHandle
    {
        var h = new SVDOMPopupHandle();
        var parent_handle = h.handle;
        var content_handle = h.handle + '_content';

        var html = `
            <div style="position:absolute; left:${x}px; top:${y}px; box-shadow: 0 1px 1px #0000, 0 0px 2px;">
                <div id=${content_handle}></div>
            </div>`;

        var newDiv = document.createElement('div');
        newDiv.id = parent_handle;
        newDiv.innerHTML = html;

        var renderDiv = newDiv.querySelector(`#${content_handle}`);

        component.Render(renderDiv);

        //we have a root level div wherein all popups are kept
        var popupModal = document.getElementById("popup-modal");
        popupModal.appendChild(newDiv);

        popupModal.style.display = 'block';
        // When the user clicks anywhere outside of the modal, close it
        var checkOutsideClick = function(event)
        {
            //allow clicks within the popup, clicks outside will close it
            if (event.target == popupModal)
            {
                popupModal.removeChild(newDiv);
                component.RenderCleanup();

                window.removeEventListener("click",checkOutsideClick);
                popupModal.style.display = 'none';
            }
        }

        window.addEventListener("click", checkOutsideClick);
        return h;
    }

    ClosePopupComponent(h?:SVDOMPopupHandle)
    {
        var popupModal = document.getElementById("popup-modal");
        if (!popupModal)
            return;

        if (h)
        {
            var em = popupModal.querySelector(`#${h.handle}`);
            if (em)
            {
                popupModal.removeChild(em);
                popupModal.style.display = 'none';
            }
        }
        else
        {
            popupModal.innerHTML = ""; //remove all children
            popupModal.style.display = 'none';
        }
    }

    DisplayModalMessage(message:string)
    {
        this.DisplayModalComponent(new StringMessageComponent(this,message));
    }

    DisplayModalComponent(component:SVDOMComponent)
    {
        var modal = document.getElementById('modal');
        var modalContent = document.getElementById('modal-content');
        
        component.Render(modalContent);

        modal.style.display = "flex";

        // When the user clicks anywhere outside of the modal, close it
        var checkOutsideClick = function(event)
        {
            if (event.target == modal)
            {
                modalContent.innerHTML = '';
                component.RenderCleanup();
                modal.style.display = "none";
                window.removeEventListener("click",checkOutsideClick);
            }
        }

        window.addEventListener("click", checkOutsideClick);
    }

    ClearModalComponent()
    {
        var modal = document.getElementById('modal');
        var modalContent = document.getElementById('modal-content');

        if (modalContent)
            modalContent.innerHTML = '';
        if (modal)
            modal.style.display = "none";
    }

}

class StringMessageComponent extends SVDOMComponent
{
    message:string;

    constructor(parent:SVDOMComponent,message:string)
    {
        super(parent);
        this.message = message;
    }

    async Render(em:Element)
    {
        em.innerHTML = this.message;
    }
}



export type SVDOMComponentConstructor = new(parent:SVDOMComponent)=>SVDOMComponent;