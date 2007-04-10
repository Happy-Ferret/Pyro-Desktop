/* -*- mode: C++; c-basic-offset: 4; indent-tabs-mode: nil; -*- */

#include "compzillaWindow.h"

#include <nsIDOMEventTarget.h>
#include <nsISupportsUtils.h>
#include <nsStringAPI.h>

#include <stdio.h>
#include <X11/extensions/Xcomposite.h>


#define DEBUG(format...) printf("   - " format)
#define INFO(format...) printf(" *** " format)
#define WARNING(format...) printf(" !!! " format)
#define ERROR(format...) fprintf(stderr, format)


NS_IMPL_ADDREF(compzillaWindow)
NS_IMPL_RELEASE(compzillaWindow)
NS_INTERFACE_MAP_BEGIN(compzillaWindow)
    NS_INTERFACE_MAP_ENTRY_AMBIGUOUS(nsISupports, nsIDOMKeyListener)
    NS_INTERFACE_MAP_ENTRY_AMBIGUOUS(nsIDOMEventListener, nsIDOMKeyListener)
    NS_INTERFACE_MAP_ENTRY(nsIDOMKeyListener)
    NS_INTERFACE_MAP_ENTRY(nsIDOMMouseListener)
    NS_INTERFACE_MAP_ENTRY(nsIDOMUIListener)
NS_INTERFACE_MAP_END


compzillaWindow::compzillaWindow(Display *display, Window win)
    : mContent(),
      mDisplay(display),
      mWindow(win),
      mPixmap(nsnull)
{
    NS_INIT_ISUPPORTS();

    /* 
     * Set up damage notification.  RawRectangles gives us smaller grain
     * changes, versus NonEmpty which seems to always include the entire
     * contents.
     */
    mDamage = XDamageCreate (display, win, XDamageReportNonEmpty);

    // Redirect output
    //XCompositeRedirectWindow (display, win, CompositeRedirectManual);
    XCompositeRedirectWindow (display, win, CompositeRedirectAutomatic);

    XSelectInput(display, win, (PropertyChangeMask | EnterWindowMask | FocusChangeMask));

    EnsurePixmap();
}


compzillaWindow::~compzillaWindow()
{
    WARNING ("compzillaWindow::~compzillaWindow %p, xid=%p\n", this, mWindow);

    // Don't send events
    // FIXME: This crashes for some reason
    //ConnectListeners (false);

    // Let the window render itself
    XCompositeUnredirectWindow (mDisplay, mWindow, CompositeRedirectAutomatic);

    if (mDamage) {
        XDamageDestroy(mDisplay, mDamage);
    }
    if (mPixmap) {
        XFreePixmap(mDisplay, mPixmap);
    }
}


void
compzillaWindow::EnsurePixmap()
{
    if (!mPixmap) {
        XGrabServer (mDisplay);

        XGetWindowAttributes(mDisplay, mWindow, &mAttr);
        if (mAttr.map_state == IsViewable) {
            mPixmap = XCompositeNameWindowPixmap (mDisplay, mWindow);
        }

        XUngrabServer (mDisplay);
    }
}


void
compzillaWindow::ConnectListeners (bool connect)
{
    const char *events[] = {
	// nsIDOMKeyListener events
	// NOTE: These aren't delivered due to WM focus issues currently
	"keydown",
	"keyup",
	"keypress",

	// nsIDOMMouseListener events
	"mousedown",
	"mouseup",
	"mouseover",
	"mouseout",
	"mousein",
	"click",
	"dblclick",

	// nsIDOMUIListener events
	"activate",
	"focusin",
	"focusout",

	// HandleEvent events
	"mousemove",
	"DOMMouseScroll",

	NULL
    };

    nsCOMPtr<nsIDOMEventTarget> target = do_QueryInterface (mContent);
    nsCOMPtr<nsIDOMEventListener> listener = 
	do_QueryInterface (NS_ISUPPORTS_CAST (nsIDOMKeyListener *, this));

    if (!target || !listener) {
	return;
    }

    for (int i = 0; events [i]; i++) {
	nsString evname = NS_ConvertASCIItoUTF16 (events [i]);
	if (connect) {
	    target->AddEventListener (evname, listener, PR_TRUE);
	} else {
	    target->RemoveEventListener (evname, listener, PR_TRUE);
	}
    }
}


void 
compzillaWindow::SetContent (nsCOMPtr<nsISupports> aContent)
{
    // FIXME: This crashes for some reason
    //ConnectListeners (false);

    mContent = aContent;
    ConnectListeners (true);
}


// All of the event listeners below return NS_OK to indicate that the
// event should not be consumed in the default case.

NS_IMETHODIMP
compzillaWindow::HandleEvent (nsIDOMEvent* aDOMEvent)
{
    nsString type;
    const PRUnichar *widedata;
    aDOMEvent->GetType (type);
    NS_LossyConvertUTF16toASCII ctype(type);
    const char *cdata;
    NS_CStringGetData (ctype, &cdata);

    nsCOMPtr<nsIDOMEventTarget> target;
    aDOMEvent->GetTarget (getter_AddRefs (target));

    WARNING ("compzillaWindow::HandleEvent: type=%s, target=%p!!!\n", cdata, target.get ());

    // Eat DOMMouseScroll events
    aDOMEvent->StopPropagation ();
    aDOMEvent->PreventDefault ();

    return NS_OK;
}


NS_IMETHODIMP
compzillaWindow::KeyDown (nsIDOMEvent* aDOMEvent)
{
    WARNING ("compzillaWindow::KeyDown: W00T!!!\n");
    return NS_ERROR_NOT_IMPLEMENTED;
}


NS_IMETHODIMP
compzillaWindow::KeyUp (nsIDOMEvent* aDOMEvent)
{
    WARNING ("compzillaWindow::KeyUp: W00T!!!\n");
    return NS_ERROR_NOT_IMPLEMENTED;
}


NS_IMETHODIMP
compzillaWindow::KeyPress(nsIDOMEvent* aDOMEvent)
{
    WARNING ("compzillaWindow::KeyPress: W00T!!!\n");
    return NS_ERROR_NOT_IMPLEMENTED;
}


void
compzillaWindow::SendMouseEvent (int eventType, nsIDOMMouseEvent *mouseEv)
{
    // Build up the XEvent we will send
    XEvent xev = { 0 };

    xev.xany.type = eventType;

    switch (eventType) {
    case ButtonPress:
    case ButtonRelease:
	xev.xbutton.window = mWindow;
	xev.xbutton.root = mAttr.root;
	mouseEv->GetTimeStamp ((DOMTimeStamp *) &xev.xbutton.time);
	mouseEv->GetClientX (&xev.xbutton.x);
	mouseEv->GetClientY (&xev.xbutton.y);
	mouseEv->GetScreenX (&xev.xbutton.x_root);
	mouseEv->GetScreenY (&xev.xbutton.y_root);
	mouseEv->GetButton ((PRUint16 *) &xev.xbutton.button);
	break;

    case MotionNotify:
	xev.xmotion.window = mWindow;
	xev.xmotion.root = mAttr.root;
	mouseEv->GetTimeStamp ((DOMTimeStamp *) &xev.xmotion.time);
	mouseEv->GetClientX (&xev.xmotion.x);
	mouseEv->GetClientY (&xev.xmotion.y);
	mouseEv->GetScreenX (&xev.xmotion.x_root);
	mouseEv->GetScreenY (&xev.xmotion.y_root);
	break;

    case EnterNotify:
    case LeaveNotify:
	xev.xcrossing.window = mWindow;
	xev.xcrossing.root = mAttr.root;
	mouseEv->GetTimeStamp ((DOMTimeStamp *) &xev.xcrossing.time);
	mouseEv->GetClientX (&xev.xcrossing.x);
	mouseEv->GetClientY (&xev.xcrossing.y);
	mouseEv->GetScreenX (&xev.xcrossing.x_root);
	mouseEv->GetScreenY (&xev.xcrossing.y_root);
	break;

    default:
	ERROR ("compzillaWindow::SendMouseEvent: Unknown event type %d\n", eventType);
	return;
    }

    // Figure out who to send to
    long xevMask;

    switch (eventType) {
    case ButtonPress:
	xevMask = ButtonPressMask;
	break;
    case ButtonRelease:
	xevMask = ButtonReleaseMask;
	break;
    case MotionNotify:
	xevMask = (PointerMotionMask | PointerMotionHintMask);
	if (xev.xmotion.state) {
	    xevMask |= (Button1MotionMask |
			Button2MotionMask |
			Button3MotionMask |
			Button4MotionMask |
			Button5MotionMask | 
			ButtonMotionMask);
	}
	break;
    case EnterNotify:
	xevMask = EnterWindowMask;
	break;
    case LeaveNotify:
	xevMask = LeaveWindowMask;
	break;
    }

    int ret = XSendEvent (mDisplay, mWindow, True, xevMask, &xev);
    DEBUG ("compzillaWindow::SendMouseEvent: XSendEvent to win=%p returned %d\n", mWindow, ret);

    // Stop processing event
    mouseEv->StopPropagation ();
    mouseEv->PreventDefault ();
}


NS_IMETHODIMP
compzillaWindow::MouseDown (nsIDOMEvent* aDOMEvent)
{
    nsCOMPtr<nsIDOMMouseEvent> mouseEv = do_QueryInterface (aDOMEvent);
    SendMouseEvent (ButtonPress, mouseEv);

    WARNING ("compzillaWindow::MouseDown: Handled\n");

    return NS_OK;
}


NS_IMETHODIMP
compzillaWindow::MouseUp (nsIDOMEvent* aDOMEvent)
{
    nsCOMPtr<nsIDOMMouseEvent> mouseEv = do_QueryInterface (aDOMEvent);
    SendMouseEvent (ButtonRelease, mouseEv);
    WARNING ("compzillaWindow::MouseUp: Handled\n");
    return NS_OK;
}


NS_IMETHODIMP
compzillaWindow::MouseClick (nsIDOMEvent* aDOMEvent)
{
    nsCOMPtr<nsIDOMMouseEvent> mouseEv = do_QueryInterface (aDOMEvent);
    WARNING ("compzillaWindow::MouseClick: Ignored\n");
    return NS_ERROR_NOT_IMPLEMENTED;
}


NS_IMETHODIMP
compzillaWindow::MouseDblClick (nsIDOMEvent* aDOMEvent)
{
    nsCOMPtr<nsIDOMMouseEvent> mouseEv = do_QueryInterface (aDOMEvent);
    WARNING ("compzillaWindow::MouseDblClick: Ignored\n");
    return NS_ERROR_NOT_IMPLEMENTED;
}


NS_IMETHODIMP
compzillaWindow::MouseOver (nsIDOMEvent* aDOMEvent)
{
    nsCOMPtr<nsIDOMMouseEvent> mouseEv = do_QueryInterface (aDOMEvent);
    SendMouseEvent (EnterNotify, mouseEv);
    WARNING ("compzillaWindow::MouseOver: Handled\n");
    return NS_OK;
}


NS_IMETHODIMP
compzillaWindow::MouseOut (nsIDOMEvent* aDOMEvent)
{
    nsCOMPtr<nsIDOMMouseEvent> mouseEv = do_QueryInterface (aDOMEvent);
    SendMouseEvent (LeaveNotify, mouseEv);
    WARNING ("compzillaWindow::MouseOut: Handled\n");
    return NS_OK;
}


NS_IMETHODIMP
compzillaWindow::Activate (nsIDOMEvent* aDOMEvent)
{
    WARNING ("compzillaWindow::Activate: W00T!!!\n");
    return NS_ERROR_NOT_IMPLEMENTED;
}


NS_IMETHODIMP
compzillaWindow::FocusIn (nsIDOMEvent* aDOMEvent)
{
    WARNING ("compzillaWindow::FocusIn: W00T!!!\n");
    return NS_ERROR_NOT_IMPLEMENTED;
}


NS_IMETHODIMP
compzillaWindow::FocusOut (nsIDOMEvent* aDOMEvent)
{
    WARNING ("compzillaWindow::FocusOut: W00T!!!\n");
    return NS_ERROR_NOT_IMPLEMENTED;
}