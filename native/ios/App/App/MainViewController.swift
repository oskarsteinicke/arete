import UIKit
import Capacitor

/// Capacitor's bridge view controller, plus the plugins that live in this app
/// rather than in an npm package. Main.storyboard uses this class; npm plugins
/// still register themselves as before.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(RestTimerPlugin())
    }
}
