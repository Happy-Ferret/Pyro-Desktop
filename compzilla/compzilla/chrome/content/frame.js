/* -*- mode: javascript; c-basic-offset: 4; indent-tabs-mode: t; -*- */


cls = Components.classes['@pyrodesktop.org/compzillaService'];
svc = cls.getService(Components.interfaces.compzillaIControl);

var _focusedFrame;

function getDescendentById (root, id)
{
    if (root.id == id)
	return root;

    for (var el = root.firstChild; el != null; el = el.nextSibling) {
	var rv = getDescendentById (el, id);
	if (rv != null) {
	    return rv;
	}
    }

    return null;
}


/* probably a rather more useful function */
function addCachedEventListener (o, eventid, cachedListener, newListener, usecapture)
{
    if (cachedListener != undefined)
	o.removeEventListener (eventid, cachedListener, usecapture);
    o.addEventListener (eventid, newListener, usecapture);
    return newListener;
}


function findPos (obj) 
{
    var curleft = curtop = 0;
    if (obj.offsetParent) {
        curleft = obj.offsetLeft;
        curtop = obj.offsetTop;
        while (obj = obj.offsetParent) {
            curleft += obj.offsetLeft;
            curtop += obj.offsetTop;
        }
    }
    return [curleft, curtop];
}


var FrameMethods = {
    destroy: function () {
	Debug ("frame",
	       "frame.destroy");

	if (this._content && this._content.destroy) {
	    this._content.destroy ();
            this._content = null;
	}

	if (_focusedFrame == this)
	    _focusedFrame = null;

	windowStack.removeWindow (this);
    },


    moveResize: function (x, y, width, height) {
        // Coordinates are relative to the frame

	Debug ("frame", 
	       "frame.moveResize: x=" + x + ", y=" + y + ", w=" + width + ", h=" + height);

	this._moveResize (x, y, width, height);
        this._configureNativeWindow ();
    },


    _moveResize: function (x, y, width, height) {
        // Coordinates are relative to the frame

        Debug ("BEFORE _moveResize: this.offsetHeight=" + this.offsetHeight + 
               " this._contentBox.style.height=" + this._contentBox.style.height + 
               " this._contentBox.offsetHeight=" + this._contentBox.offsetHeight);

	if (this.offsetLeft != x) {
	    this.style.left = x + "px";
	}

	if (this.offsetTop != y) {
	    this.style.top = y + "px";
	}

        if (this.offsetWidth != width) {
	    // calculate the content box's width based on the delta to the new frame width.
            var content_width = this._contentBox.offsetWidth + (width - this.offsetWidth);

            this._contentBox.style.width = content_width + "px";

	    if (this._content.nativeWindow)
		this._content.width = content_width;

            this.style.width = width + "px";
        }

        if (this.offsetHeight != height) {
	    // calculate the content box's width based on the delta to the new frame width.
            var content_height = this._contentBox.offsetHeight + (height - this.offsetHeight);

            this._contentBox.style.height = content_height + "px";

	    if (this._content.nativeWindow)
		this._content.height = content_height;

            this.style.height = height + "px";
        }

        Debug ("AFTER _moveResize: this.offsetHeight=" + this.offsetHeight + 
               " this._contentBox.style.height=" + this._contentBox.style.height + 
               " this._contentBox.offsetHeight=" + this._contentBox.offsetHeight);
    },


    _configureNativeWindow: function () {
        if (!this._content.nativeWindow)
            return;

        this._content.width = this._content.offsetWidth;
        this._content.height = this._content.offsetHeight;

        if (this.overrideRedirect)
            return;

        var pos = findPos (this._content);
        Debug("FindPos: " + pos);

        Debug("Calling ConfigureWindow: xid=" +
              this._content.nativeWindow.nativeWindowId + ", x=" +
              pos[0] + ", y=" +
              pos[1] + ", width=" +
              this._content.width + ", height=" +
              this._content.height);

        svc.ConfigureWindow (this._content.nativeWindow.nativeWindowId,
                             pos[0],
                             pos[1],
                             this._content.width,
                             this._content.height,
                             0);
    },
    

    _resetChromeless: function () {
        if (this.overrideRedirect ||
            this.wmWindowType == Atoms._NET_WM_WINDOW_TYPE_DOCK ||
            this.wmWindowType == Atoms._NET_WM_WINDOW_TYPE_DESKTOP ||
            this.wmWindowType == Atoms._NET_WM_WINDOW_TYPE_SPLASH ||
            this.wmWindowType == Atoms._NET_WM_WINDOW_TYPE_TOOLBAR) {
            this.chromeless = true;
        } else {
            this.chromeless = false;
        }
    },


    _recomputeAllowedActions: function () {
	/* this only applies for native windows, and those windows
	   which have had mwm hints/wmWindowType set. */
	if (!this.wmWindowType)
	    return;

	// XXX first consider the mwm hints

	// next override using metacity's rules for assigning features
	// based on EWMH's window types.
        var isSpecial = 
            (this.wmWindowType == Atoms._NET_WM_WINDOW_TYPE_DESKTOP ||
             this.wmWindowType == Atoms._NET_WM_WINDOW_TYPE_DOCK ||
             this.wmWindowType == Atoms._NET_WM_WINDOW_TYPE_SPLASH);
        var isNormal = 
            this.wmWindowType == Atoms._NET_WM_WINDOW_TYPE_NORMAL;

        this.allowClose = !isSpecial;
        this.allowShade = !isSpecial;
        this.allowMove = !isSpecial;
        this.allowResize = !isSpecial;

        this.allowMaximize = isNormal;
        this.allowMinimize = isNormal;
        this.allowFullscreen = isNormal;

	if (!this.allowResize) {
	    this.allowMaximize = false;
	    this.allowFullscreen = false;
	}
    },


    show: function () {
	Debug ("frame", "frame.show");

	this.style.display = "block";
    },


    hide: function () {
	Debug ("frame", "frame.hide");

	this.style.display = "none";
    },


    getPyroAttribute: function (name) {
        return this.getAttributeNS ("http://www.pyrodesktop.org/compzilla", name);
    },


    setPyroAttribute: function (name, value) {
        this.setAttributeNS ("http://www.pyrodesktop.org/compzilla", name, value);
    },


    addProperty: function (name, getter, setter) {
	this.__defineGetter__ (name, getter);

	/* allow setter to be undefined for read-only properties */
	if (setter != undefined)
	    this.__defineSetter__ (name, setter);
    },

};


function _addFrameMethods (frame)
{
    for (var m in FrameMethods) {
	frame[m] = FrameMethods[m];
    }

    // now add our public properties
    frame.addProperty ("title",
		       /* getter */
		       function () {
			   return this._title ? this._title.value : null;
		       },
		       /* setter */
		       function (t) {
			   if (!this._title)
			       return;

			   if (t)
			       this._title.value = t;
                           else
                               this._title.value = "[Unknown]";

			   // XXX presumably this should set the
			   // _NET_WM_NAME property on the native
			   // window (by setting wmName?), although it
			   // can't because the then the property
			   // change code will fire and we'll end up
			   // setting frame.title, etc, etc
		       });

    frame.addProperty ("wmClass",
		       /* getter */
		       function () {
			   return this.getPyroAttribute ("wm-class");
                       },
		       /* setter */
		       function (wmclass) {
			   this.setPyroAttribute ("wm-class", wmclass);
		       });

    frame.addProperty ("wmName",
		       /* getter */
		       function () {
			   if (!this._wm_name && this._content) {
			       var prop_val = 
				   this._content.nativeWindow.GetProperty (Atoms._NET_WM_NAME);
			       if (prop_val) {
				   this._wm_name = prop_val.getProperty (".text");
			       }
			       else {
				   prop_val = 
				       this._content.nativeWindow.GetProperty (Atoms.WM_NAME);
				   if (prop_val)
				       this._wm_name = prop_val.getProperty (".text");
			       }
			   }

			   return this._wm_name;
		       },
		       /* setter */
		       function (wmname) {
			   // XXX see comment up above in frame.title
			   // setter.
		       });

    frame.addProperty ("allowResize",
		       /* getter */
		       function () {
			   return this.getPyroAttribute ("allow-resize");
		       },
		       /* setter */
		       function (val) {
			   this.setPyroAttribute ("allow-resize", val);
		       });

    frame.addProperty ("allowMaximize",
		       /* getter */
		       function () {
			   return this.getPyroAttribute ("allow-maximize");
		       },
		       /* setter */
		       function (val) {
			   this.setPyroAttribute ("allow-maximize", val);
		       });

    frame.addProperty ("allowMinimize",
		       /* getter */
		       function () {
			   return this.getPyroAttribute ("allow-minimize");
		       },
		       /* setter */
		       function (val) {
			   this.setPyroAttribute ("allow-minimize", val);
		       });

    frame.addProperty ("allowMove",
		       /* getter */
		       function () {
			   return this.getPyroAttribute ("allow-move");
		       },
		       /* setter */
		       function (val) {
			   this.setPyroAttribute ("allow-move", val);
		       });

    frame.addProperty ("allowShade",
		       /* getter */
		       function () {
			   return this.getPyroAttribute ("allow-shade");
		       },
		       /* setter */
		       function (val) {
			   this.setPyroAttribute ("allow-shade", val);
		       });

    frame.addProperty ("inactive",
		       /* getter */
		       function () {
			   return this.getPyroAttribute ("inactive");
		       },
		       /* setter */
		       function (val) {
			   this.setPyroAttribute ("inactive", val);
		       });

    frame.addProperty ("moving",
		       /* getter */
		       function () {
			   return this.getPyroAttribute ("moving");
		       },
		       /* setter */
		       function (val) {
			   this.setPyroAttribute ("moving", val);
		       });

    frame.addProperty ("chromeless",
		       /* getter */
		       function () {
                           return this.className.indexOf ("chromeless") != -1;
                       },
		       /* setter */
		       function () {
                           this.className = this.className.replace ("chromeless", "");
		       });

    frame.addProperty ("wmWindowType",
		       /* getter */
		       function () {
                           if (!this._net_wm_window_type && this._content) {
			       // XXX _NET_WM_WINDOW_TYPE is actually an array of atoms
			       var prop_val = this._content.nativeWindow.GetProperty (
			           Atoms._NET_WM_WINDOW_TYPE);
			       if (prop_val)
				   this._net_wm_window_type = 
				       prop_val.getPropertyAsUint32 (".atom");
                           }

			   return this._net_wm_window_type;
		       },
		       /* setter */
		       function (val) {
			   // XXX we can't just update the cached
			   // value.  we have to update the window's
			   // property as well.  actually I can't
			   // think of a reason why we'd be setting
			   // this in compzilla.  we should just
			   // remove the setter.
                           this._net_wm_window_type = val;
                           this._resetChromeless ();
                           this._recomputeAllowedActions ();
		       });

    frame.addProperty ("overrideRedirect",
		       /* getter */
		       function () {
                           return this._overrideRedirect;
		       },
		       /* setter */
		       function (val) {
                           this._overrideRedirect = val;
                           this._resetChromeless ();
		       });

    frame.addProperty ("content",
		       /* getter */
		       function () {
			   return this._content;
		       }
		       /* no setter */
		       );
}


function CompzillaFrame (content)
{
    var frame = document.getElementById ("windowFrame").cloneNode (true);

    frame._content = content;

    frame._titleBox = getDescendentById (frame, "windowTitleBox");

    frame._contentBox = getDescendentById (frame, "windowContentBox");
    frame._contentBox.appendChild (content);

    frame._title = getDescendentById (frame, "windowTitle");

    // Add our methods
    _addFrameMethods (frame);
    
    if (content.nativeWindow) {
        frame.id = "XID:" + content.nativeWindow.nativeWindowId;

	_connectNativeWindowListeners (frame, content.nativeWindow);
        frame._recomputeAllowedActions ();

	frame.title = frame.wmName;
    }

    if (frame._title) {
	_connectFrameDragListeners (frame);
    }

    _connectFrameFocusListeners (frame);

    return frame;
}


function _connectFrameFocusListeners (frame)
{
    // click to raise/focus
    frame.addEventListener (
        "mousedown", 
        {
            handleEvent: function (event) {
		windowStack.moveToTop (frame);

                Debug ("mousedown: inactive = " + frame.inactive);

                // XXX this should live in some sort of focus handler, not here.
                if (frame != _focusedFrame) {
                    if (_focusedFrame) {
                        // Send FocusOut
                        _focusedFrame._content.blur ();
                        _focusedFrame.inactive = true;
                    }

                    // Send FocusIn
                    frame._content.focus ();
                    frame.inactive = false;

                    _focusedFrame = frame;
                }
            }
        },
	true);
}


function _connectFrameDragListeners (frame)
{
    var frameDragPosition = new Object ();

    var frameDragMouseMoveListener = {
        handleEvent: function (ev) {
	    // figure out the deltas
	    var dx = ev.clientX - frameDragPosition.x;
	    var dy = ev.clientY - frameDragPosition.y;

	    frameDragPosition.x = ev.clientX;
	    frameDragPosition.y = ev.clientY;

	    var new_x = frame.offsetLeft,
		new_y = frame.offsetTop,
		new_width = frame.offsetWidth,
		new_height = frame.offsetHeight;

	    if (frameDragPosition.operation == "move-resize") {
                new_x = frame.offsetLeft + dx;
                new_y = frame.offsetTop + dy;
		new_width = frame.offsetWidth;
		new_height = frame.offsetHeight;
	    }
	    else {
		// calculate y/height
		switch (frameDragPosition.operation) {
		case "nw-resize":
		case "ne-resize":
		case "n-resize":
		    new_height = frame._contentBox.offsetHeight - dy;
		    new_y = frame.offsetTop + dy;
		    break;
		case "sw-resize":
		case "se-resize":
		case "s-resize":
		    new_height = frame._contentBox.offsetHeight + dy;
		    break;
		}

		// calculate x/width
		switch (frameDragPosition.operation) {
		case "nw-resize":
		case "sw-resize":
		case "w-resize":
		    new_width = frame._contentBox.offsetWidth - dx;
		    new_x = frame.offsetLeft + dx;
		    break;
		case "ne-resize":
		case "se-resize":
		case "e-resize":
		    new_width = frame._contentBox.offsetWidth + dx;
		    break;
		}
	    }

	    frame.moveResize (new_x, new_y, new_width, new_height);

	    ev.preventDefault ();
	    ev.stopPropagation ();
	}
    };

    var frameDragMouseUpListener = {
	handleEvent: function (ev) {
	    frame.moving = false;

	    // clear the event handlers we add in the title mousedown handler below
	    document.removeEventListener ("mousemove", frameDragMouseMoveListener, true);
	    document.removeEventListener ("mouseup", frameDragMouseUpListener, true);

	    ev.preventDefault ();
	    ev.stopPropagation ();
	}
    };

    frame.onmousedown = function (ev) {
        var op = ev.target.getAttributeNS ("http://www.pyrodesktop.org/compzilla", "resize");
        if (!op)
            return;

	frameDragPosition.x = ev.clientX;
	frameDragPosition.y = ev.clientY;

        if (op == "move") {
            if (!frame.allowMove)
                return;
            frame.moving = true;
        } else if (!frame.allowResize)
            return;

        frameDragPosition.operation = op + "-resize";

	document.addEventListener ("mousemove", frameDragMouseMoveListener, true);
	document.addEventListener ("mouseup", frameDragMouseUpListener, true);
	ev.stopPropagation ();
    };
}


function _connectNativeWindowListeners (frame, nativewin)
{
    frame._nativeDestroyListener =
	addCachedEventListener (
	    nativewin,
	    "destroy",
	    frame._nativeDestroyListener,
		{
		    handleEvent: function (ev) {
			Debug ("frame", "destroy.handleEvent (" + content + ")");
			frame.destroy ();
		    }
		},
	    true);

    frame._nativeConfigureListener =
	addCachedEventListener (
	    nativewin,
	    "configure",
	    frame._nativeConfigureListener,
		{
		    handleEvent: function (ev) {
			Debug ("frame", "configure.handleEvent");

                        // This is the only way we're notified of override changes
                        frame.overrideRedirect = ev.overrideRedirect;

                        // ev coords are relative to content, adjust for frame offsets
			frame.moveResize (
			    ev.x - frame._contentBox.offsetLeft,
			    ev.y - frame._contentBox.offsetTop,
			    ev.width - frame._contentBox.offsetWidth + frame.offsetWidth,
			    ev.height - frame._contentBox.offsetHeight + frame.offsetHeight);

			// XXX handle stacking requests here too
		    }
		},
	    true);

    frame._nativeMapListener =
	addCachedEventListener (
	    nativewin,
	    "map",
	    frame._nativeMapListener,
		{
		    handleEvent: function (ev) {
			Debug ("frame", "map.handleEvent");
			frame.show ();
		    }
		},
	    true);

    frame._nativeUnmapListener =
	addCachedEventListener (
	    nativewin,
	    "unmap",
	    frame._nativeUnmapListener,
		{
		    handleEvent: function (ev) {
			Debug ("frame", "unmap.handleEvent");
			frame.hide ();
		    }
		},
	    true);

    frame._nativePropertyChangeListener =
	addCachedEventListener (
	    nativewin,
	    "propertychange",
	    frame._nativePropertyChangeListener,
		{
		    handleEvent: function (ev) {
			Debug ("frame", "propertychange.handleEvent: ev.atom=" + ev.atom);

			if (ev.atom == Atoms.WM_NAME ||
			    ev.atom == Atoms._NET_WM_NAME) {

			    frame._wm_name = null; /* uncached value */

			    frame.title = frame.wmName;

			    Debug ("frame", "propertychange: setting title:" + frame.title);
			    return;
			}

			if (ev.atom == Atoms._NET_WM_WINDOW_TYPE) {

			    this._net_wm_window_type = null; /* uncached value */

			    frame._recomputeAllowedActions ();
			    return;
			}

			if (ev.atom == Atoms.WM_CLASS) {
			    var prop_val = 
			        frame.content.nativeWindow.GetProperty (Atoms.WM_CLASS);
			    if (prop_val)
				frame.wmClass = (prop_val.getProperty (".instanceName") +
						 " " +
						 prop_val.getProperty (".className"));
			    else
				frame.wmClass = "";

			    Debug ("frame", "propertychange: setting wmClass: '" +  
                                   frame.wmClass + "'");
			    return;
			}
		    }
		},
	    true);
}
