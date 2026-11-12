import SwiftUI

struct SetupView: View {
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Label("YouTube · 5-minute passes", systemImage: "play.rectangle")
                    Label("Hacker News", systemImage: "newspaper")
                    Label("X / Twitter and Nitter", systemImage: "bubble.left.and.bubble.right")
                } header: {
                    Text("Blocked sites")
                }
                Section("Custom sites") {
                    Text("In Safari, open the page menu, then Browser Again to block the current site. Choose exact domains or subdomains, and permanent blocking or five-minute access.")
                }
                Section {
                    Text("1. Open Settings > Apps > Safari > Extensions.")
                    Text("2. Turn on Browser Again Extension.")
                    Text("3. Set All Websites to Allow.")
                } header: {
                    Text("Enable in Safari")
                } footer: {
                    Text("Access to all websites lets the extension recognize Nitter on unknown domains. Page detection runs on your device. No browsing data is collected or sent.")
                }
                Section {
                    Text("Take a breath, then choose whether to open YouTube for 5 minutes or close the tab. Emergency is available for later cycles in the same session. Other listed domains stay blocked. Standard Nitter instances on other domains are detected as the page loads. Modified forks can evade detection.")
                    Text("Enable the extension for each Safari profile you use. Allow it in Private Browsing if you use private tabs.")
                } footer: {
                    Text("This blocks websites in Safari. It does not block standalone apps or other browsers.")
                }
            }
            .navigationTitle("Browser Again")
        }
    }
}
