import { ipcMain, ipcRenderer, webContents } from 'electron'

class RemoteStore {
  /* **************************************************************************/
  // Lifecycle
  /* **************************************************************************/

  /**
  * @param dispatchName: the unique identifier to use when dispatching
  * @param actionsName: the name given to the actions
  * @param storeName: the name given to the store
  */
  constructor (dispatchName, actionsName, storeName) {
    this.__remote__ = {
      names: {
        dispatch: dispatchName,
        actions: actionsName,
        store: storeName
      },
      connected: process.type === 'browser' ? new Set() : undefined
    }

    /* ****************************************/
    // Remote
    /* ****************************************/

    if (process.type === 'browser') {
      ipcMain.on(`ALT:CONNECT:${this.__remote__.names.dispatch}`, this._remoteHandleConnect)
      ipcMain.on(`ALT:DISPATCH_REMOTE_ACTION:${this.__remote__.names.dispatch}`, this._remoteHandleDispatch)
    } else if (process.type === 'renderer') {
      ipcRenderer.on(`ALT:DISPATCH_REMOTE_ACTION:${this.__remote__.names.dispatch}`, this._remoteHandleDispatch)
    }
  }

  /* **************************************************************************/
  // Remote handlers
  /* **************************************************************************/

  _remoteHandleConnect = (evt) => {
    if (process.type !== 'browser') { return }

    const senderId = evt.sender.id
    if (!this.__remote__.connected.has(senderId)) {
      this.__remote__.connected.add(senderId)
      evt.sender.once('destroyed', () => {
        this.__remote__.connected.delete(senderId)
      })
    }

    evt.returnValue = {}
  }

  /**
  * Handles a remote store dispatching
  * @param evt: the event that fired
  * @param fnName: the function name to dispatch
  * @param args: the arguments to dispatch with
  */
  _remoteHandleDispatch = (evt, fnName, args) => {
    const actions = this.alt.getActions(this.__remote__.names.actions)
    actions[fnName](...args)
  }

  /* **************************************************************************/
  // Remote tools
  /* **************************************************************************/

  /**
  * Dispatches a call on all the connected clients
  * @param fnName: the name of the method to dispatch
  * @param args: the arguments to supply
  */
  dispatchToRemote (fnName, args) {
    if (process.type === 'browser') {
      Array.from(this.__remote__.connected).forEach((wcId) => {
        const wc = webContents.fromId(wcId)
        if (wc) {
          wc.send(`ALT:DISPATCH_REMOTE_ACTION:${this.__remote__.names.dispatch}`, fnName, args)
        }
      })
    } else if (process.type === 'renderer') {
      ipcRenderer.send(`ALT:DISPATCH_REMOTE_ACTION:${this.__remote__.names.dispatch}`, fnName, args)
    }
  }
}

export default RemoteStore