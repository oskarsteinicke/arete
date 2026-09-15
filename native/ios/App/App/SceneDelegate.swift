import UIKit
import Capacitor

/// iOS 27 terminates any app that has not adopted the UIScene lifecycle —
/// `_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption` traps during
/// scene creation. Capacitor's iOS template still ships the pre-scene
/// AppDelegate with a `window` property and a Main storyboard, so a stock
/// Capacitor app crashes on launch against this SDK.
///
/// Declaring the storyboard in the scene manifest alone was not enough: the app
/// launched but presented an empty black window, because nothing instantiated
/// the storyboard's root controller into the scene's window. This builds it
/// explicitly, which is the canonical adoption and does not depend on implicit
/// storyboard loading behaviour.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene,
               willConnectTo session: UISceneSession,
               options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = UIStoryboard(name: "Main", bundle: nil)
            .instantiateInitialViewController()
        self.window = window
        // Capacitor plugins that reach for the app delegate's window still find
        // one; without this, anything doing that silently gets nil.
        (UIApplication.shared.delegate as? AppDelegate)?.window = window
        window.makeKeyAndVisible()
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    func sceneWillResignActive(_ scene: UIScene) {
        NotificationCenter.default.post(name: UIApplication.willResignActiveNotification, object: nil)
    }

    func sceneDidEnterBackground(_ scene: UIScene) {
        NotificationCenter.default.post(name: UIApplication.didEnterBackgroundNotification, object: nil)
    }

    func sceneWillEnterForeground(_ scene: UIScene) {
        NotificationCenter.default.post(name: UIApplication.willEnterForegroundNotification, object: nil)
    }

    /// Deep links (the ?join= invite path) arrive here under the scene lifecycle
    /// rather than at the app delegate.
    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard let url = URLContexts.first?.url else { return }
        ApplicationDelegateProxy.shared.application(UIApplication.shared, open: url, options: [:])
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        ApplicationDelegateProxy.shared.application(
            UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
    }
}
