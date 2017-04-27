import React from 'react'
import WaveboxRouter from './WaveboxRouter'
import constants from 'shared/constants'
import shallowCompare from 'react-addons-shallow-compare'
import Theme from 'sharedui/Components/Theme'
import MuiThemeProvider from 'material-ui/styles/MuiThemeProvider'
import { mailboxStore, mailboxDispatch, mailboxActions } from 'stores/mailbox'
import { settingsStore } from 'stores/settings'
import { googleActions } from 'stores/google'
import { trelloActions } from 'stores/trello'
import { slackActions } from 'stores/slack'
import { microsoftActions } from 'stores/microsoft'
import { updaterActions } from 'stores/updater'
import { Analytics, ServerVent } from 'Server'
import { NotificationService } from 'Notifications'
import Bootstrap from 'R/Bootstrap'
import AccountMessageDispatcher from './AccountMessageDispatcher'
import { Tray } from 'Components/Tray'
import { AppBadge } from 'Components'
const {
  ipcRenderer, remote: {shell}
} = window.nativeRequire('electron')

export default class Provider extends React.Component {
  /* **************************************************************************/
  // Lifecycle
  /* **************************************************************************/

  componentDidMount () {
    this.refocusTO = null
    this.forceFocusTO = null

    // STEP 1. App services
    Analytics.startAutoreporting()
    ServerVent.start(Bootstrap.clientId, Bootstrap.clientToken)
    NotificationService.start()
    updaterActions.load()
    updaterActions.checkForUpdates()
    ipcRenderer.on('download-completed', this.downloadCompleted)
    ipcRenderer.on('launch-settings', this.ipcLaunchSettings)

    // STEP 2. Mailbox connections
    mailboxActions.connectAllMailboxes()
    googleActions.startPollingUpdates()
    trelloActions.startPollingUpdates()
    microsoftActions.startPollingUpdates()

    // STEP 3. Listen for self
    mailboxStore.listen(this.mailboxesChanged)
    settingsStore.listen(this.settingsChanged)
    mailboxDispatch.on('blurred', this.mailboxBlurred)
  }

  componentWillUnmount () {
    clearTimeout(this.refocusTO)
    clearInterval(this.forceFocusTO)

    // STEP 1. App services
    Analytics.stopAutoreporting()
    ServerVent.stop()
    NotificationService.stop()
    updaterActions.unload()
    ipcRenderer.removeListener('download-completed', this.downloadCompleted)
    ipcRenderer.removeListener('launch-settings', this.ipcLaunchSettings)

    // STEP 2. Mailbox connections
    mailboxActions.disconnectAllMailboxes()
    googleActions.stopPollingUpdates()
    trelloActions.stopPollingUpdates()
    slackActions.disconnectAllMailboxes()
    microsoftActions.stopPollingUpdates()

    // STEP 3. Listening for self
    mailboxStore.unlisten(this.mailboxesChanged)
    settingsStore.unlisten(this.settingsChanged)
    mailboxDispatch.removeListener('blurred', this.mailboxBlurred)
  }

  /* **************************************************************************/
  // Data lifecycle
  /* **************************************************************************/

  state = (() => {
    const settingsState = settingsStore.getState()
    const mailboxState = mailboxStore.getState()
    return {
      messagesUnreadCount: mailboxState.totalUnreadCountForAppBadge(),
      hasUnreadActivity: mailboxState.hasUnreadActivityForAppBadge(),
      uiSettings: settingsState.ui,
      traySettings: settingsState.tray
    }
  })()

  mailboxesChanged = (mailboxState) => {
    this.setState({
      messagesUnreadCount: mailboxState.totalUnreadCountForAppBadge(),
      hasUnreadActivity: mailboxState.hasUnreadActivityForAppBadge()
    })
  }

  settingsChanged = (settingsStore) => {
    this.setState({
      uiSettings: settingsStore.ui,
      traySettings: settingsStore.tray
    })
  }

  /* **************************************************************************/
  // IPC Events
  /* **************************************************************************/

  /**
  * Shows a notification of a completed download
  * @param evt: the event that fired
  * @param req: the request that came through
  */
  downloadCompleted (evt, req) {
    const notification = new window.Notification('Download Completed', {
      body: req.filename
    })
    notification.onclick = function () {
      shell.openItem(req.path) || shell.showItemInFolder(req.path)
    }
  }

  /**
  * Launches the settings over the IPC channel
  */
  ipcLaunchSettings () {
    window.location.hash = '/settings'
  }

  /* **************************************************************************/
  // Rendering Events
  /* **************************************************************************/

  /**
  * Handles a mailbox bluring by trying to refocus the mailbox
  * @param evt: the event that fired
  */
  mailboxBlurred = (evt) => {
    // Requeue the event to run on the end of the render cycle
    clearTimeout(this.refocusTO)
    this.refocusTO = setTimeout(() => {
      const active = document.activeElement
      if (active.tagName === 'WEBVIEW') {
        // Nothing to do, already focused on mailbox
        clearInterval(this.forceFocusTO)
      } else if (active.tagName === 'BODY') {
        // Focused on body, just dip focus onto the webview
        clearInterval(this.forceFocusTO)
        mailboxDispatch.refocus()
      } else {
        // focused on some element in the ui, poll until we move back to body
        this.forceFocusTO = setInterval(() => {
          if (document.activeElement.tagName === 'BODY') {
            clearInterval(this.forceFocusTO)
            mailboxDispatch.refocus()
          }
        }, constants.REFOCUS_MAILBOX_INTERVAL_MS)
      }
    }, constants.REFOCUS_MAILBOX_INTERVAL_MS)
  }

  /* **************************************************************************/
  // Rendering
  /* **************************************************************************/

  shouldComponentUpdate (nextProps, nextState) {
    return shallowCompare(this, nextProps, nextState)
  }

  render () {
    const { traySettings, uiSettings, messagesUnreadCount, hasUnreadActivity } = this.state

    // Update the app title
    if (uiSettings.showTitlebarCount) {
      if (messagesUnreadCount === 0) {
        document.title = 'Wavebox'
      } else {
        document.title = `Wavebox (${messagesUnreadCount})`
      }
    } else {
      document.title = 'Wavebox'
    }

    return (
      <div>
        <MuiThemeProvider muiTheme={Theme}>
          <WaveboxRouter />
        </MuiThemeProvider>
        <AccountMessageDispatcher />
        {!traySettings.show ? undefined : (
          <Tray
            unreadCount={messagesUnreadCount}
            traySettings={traySettings} />
        )}
        {!uiSettings.showAppBadge ? undefined : (
          <AppBadge
            unreadCount={messagesUnreadCount}
            hasUnreadActivity={hasUnreadActivity} />
        )}
      </div>
    )
  }
}
