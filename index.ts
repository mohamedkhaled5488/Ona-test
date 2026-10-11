// Must be the very first import — react-native-gesture-handler's own setup
// docs require this (it patches native event handling before anything else
// has a chance to touch it).
import 'react-native-gesture-handler';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
