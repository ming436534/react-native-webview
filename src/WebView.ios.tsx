import React from 'react';
import {
  UIManager as NotTypedUIManager,
  View,
  requireNativeComponent,
  NativeModules,
  Image,
  findNodeHandle,
  ImageSourcePropType,
} from 'react-native';

import {
  defaultOriginWhitelist,
  createOnShouldStartLoadWithRequest,
  getViewManagerConfig,
  defaultRenderError,
  defaultRenderLoading,
} from './WebViewShared';
import {
  WebViewErrorEvent,
  WebViewMessageEvent,
  WebViewNavigationEvent,
  WebViewProgressEvent,
  IOSWebViewProps,
  DecelerationRateConstant,
  NativeWebViewIOS,
  ViewManager,
  State,
  CustomUIManager,
  WebViewNativeConfig,
} from './WebViewTypes';

import styles from './WebView.styles';

const UIManager = NotTypedUIManager as CustomUIManager;

const { resolveAssetSource } = Image;
// Imported from https://github.com/facebook/react-native/blob/master/Libraries/Components/ScrollView/processDecelerationRate.js
const processDecelerationRate = (
  decelerationRate: DecelerationRateConstant | number | undefined,
) => {
  let newDecelerationRate = decelerationRate;
  if (newDecelerationRate === 'normal') {
    newDecelerationRate = 0.998;
  } else if (newDecelerationRate === 'fast') {
    newDecelerationRate = 0.99;
  }
  return newDecelerationRate;
};

const RNCWKWebViewManager = NativeModules.RNCWKWebViewManager as ViewManager;
const RNCWKWebView: typeof NativeWebViewIOS = requireNativeComponent(
  'RNCWKWebView',
);

class WebView extends React.Component<IOSWebViewProps, State> {
  static defaultProps = {
    cacheEnabled: true,
    originWhitelist: defaultOriginWhitelist,
    useSharedProcessPool: true,
  };

  static isFileUploadSupported = async () => {
    // no native implementation for iOS, depends only on permissions
    return true;
  };

  state: State = {
    viewState: this.props.startInLoadingState ? 'LOADING' : 'IDLE',
    lastErrorEvent: null,
  };

  webViewRef = React.createRef<NativeWebViewIOS>();

  // eslint-disable-next-line react/sort-comp
  getCommands = () => getViewManagerConfig('RNCWKWebView').Commands;

  /**
   * Go forward one page in the web view's history.
   */
  goForward = () => {
    const h = this.getWebViewHandle();
    if (h) {
      UIManager.dispatchViewManagerCommand(
        this.getWebViewHandle(),
        this.getCommands().goForward,
        null,
      );
    }
  };

  /**
   * Go back one page in the web view's history.
   */
  goBack = () => {
    const h = this.getWebViewHandle();
    if (h) {
      UIManager.dispatchViewManagerCommand(
        this.getWebViewHandle(),
        this.getCommands().goBack,
        null,
      );
    }
  };

  /**
   * Reloads the current page.
   */
  reload = () => {
    this.setState({ viewState: 'LOADING' });
    const h = this.getWebViewHandle();
    if (h) {
      UIManager.dispatchViewManagerCommand(
        this.getWebViewHandle(),
        this.getCommands().reload,
        null,
      );
    }
  };

  /**
   * Stop loading the current page.
   */
  stopLoading = () => {
    const h = this.getWebViewHandle();
    if (h) {
      UIManager.dispatchViewManagerCommand(
        this.getWebViewHandle(),
        this.getCommands().stopLoading,
        null,
      );
    }
  };

  /**
   * Request focus on WebView rendered page.
   */
  requestFocus = () => {
    const h = this.getWebViewHandle();
    if (h) {
      UIManager.dispatchViewManagerCommand(
          this.getWebViewHandle(),
          this.getCommands().requestFocus,
          null,
      );
    }
  };

  /**
   * Posts a message to the web view, which will emit a `message` event.
   * Accepts one argument, `data`, which must be a string.
   *
   * In your webview, you'll need to something like the following.
   *
   * ```js
   * document.addEventListener('message', e => { document.title = e.data; });
   * ```
   */
  postMessage = (data: string) => {
    const h = this.getWebViewHandle();
    if (h) {
      UIManager.dispatchViewManagerCommand(
        this.getWebViewHandle(),
        this.getCommands().postMessage,
        [String(data)],
      );
    }
  };

  /**
   * Injects a javascript string into the referenced WebView. Deliberately does not
   * return a response because using eval() to return a response breaks this method
   * on pages with a Content Security Policy that disallows eval(). If you need that
   * functionality, look into postMessage/onMessage.
   */
  injectJavaScript = (data: string) => {
    const h = this.getWebViewHandle();
    if (h) {
      UIManager.dispatchViewManagerCommand(
        this.getWebViewHandle(),
        this.getCommands().injectJavaScript,
        [data],
      );
    }
  };

  /**
   * We return an event with a bunch of fields including:
   *  url, title, loading, canGoBack, canGoForward
   */
  updateNavigationState = (event: WebViewNavigationEvent) => {
    if (this.props.onNavigationStateChange) {
      this.props.onNavigationStateChange(event.nativeEvent);
    }
  };

  /**
   * Returns the native `WebView` node.
   */
  getWebViewHandle = () => {
    const nodeHandle = findNodeHandle(this.webViewRef.current);
    return nodeHandle as number;
  };

  onLoadingStart = (event: WebViewNavigationEvent) => {
    const { onLoadStart } = this.props;
    if (onLoadStart) {
      onLoadStart(event);
    }
    this.updateNavigationState(event);
  };

  onLoadingError = (event: WebViewErrorEvent) => {
    event.persist(); // persist this event because we need to store it
    const { onError, onLoadEnd } = this.props;
    if (onLoadEnd) {
      onLoadEnd(event);
    }
    if (onError) {
      onError(event);
    }
    console.warn('Encountered an error loading page', event.nativeEvent);

    this.setState({
      lastErrorEvent: event.nativeEvent,
      viewState: 'ERROR',
    });
  };

  onLoadingFinish = (event: WebViewNavigationEvent) => {
    const { onLoad, onLoadEnd } = this.props;
    if (onLoad) {
      onLoad(event);
    }
    if (onLoadEnd) {
      onLoadEnd(event);
    }
    this.setState({
      viewState: 'IDLE',
    });
    this.updateNavigationState(event);
  };

  onMessage = (event: WebViewMessageEvent) => {
    const { onMessage } = this.props;
    if (onMessage) {
      onMessage(event);
    }
  };

  onLoadingProgress = (event: WebViewProgressEvent) => {
    const { onLoadProgress } = this.props;
    if (onLoadProgress) {
      onLoadProgress(event);
    }
  };

  onShouldStartLoadWithRequestCallback = (
    shouldStart: boolean,
    _url: string,
    lockIdentifier: number,
  ) => {
    let { viewManager }: WebViewNativeConfig = this.props.nativeConfig || {};

    viewManager = viewManager || RNCWKWebViewManager;
    if (viewManager) {
      viewManager.startLoadWithResult(!!shouldStart, lockIdentifier);
    }
  };

  componentDidUpdate(prevProps: IOSWebViewProps) {

    this.showRedboxOnPropChanges(prevProps, 'allowsInlineMediaPlayback');
    this.showRedboxOnPropChanges(prevProps, 'incognito');
    this.showRedboxOnPropChanges(prevProps, 'mediaPlaybackRequiresUserAction');
    this.showRedboxOnPropChanges(prevProps, 'dataDetectorTypes');

  }

  showRedboxOnPropChanges(
    prevProps: IOSWebViewProps,
    propName: keyof IOSWebViewProps,
  ) {
    if (this.props[propName] !== prevProps[propName]) {
      console.error(
        `Changes to property ${propName} do nothing after the initial render.`,
      );
    }
  }

  render() {
    const {
      decelerationRate: decelerationRateProp,
      nativeConfig = {},
      onMessage,
      onShouldStartLoadWithRequest: onShouldStartLoadWithRequestProp,
      originWhitelist,
      renderError,
      renderLoading,
      style,
      ...otherProps
    } = this.props;

    let otherView = null;

    if (this.state.viewState === 'LOADING') {
      otherView = (renderLoading || defaultRenderLoading)();
    } else if (this.state.viewState === 'ERROR') {
      const errorEvent = this.state.lastErrorEvent;
      if (errorEvent) {
        otherView = (renderError || defaultRenderError)(
          errorEvent.domain,
          errorEvent.code,
          errorEvent.description,
        );
      }
    } else if (this.state.viewState !== 'IDLE') {
      console.error(
        `RNCWebView invalid state encountered: ${this.state.viewState}`,
      );
    }

    const webViewStyles = [styles.container, styles.webView, style];

    const onShouldStartLoadWithRequest = createOnShouldStartLoadWithRequest(
      this.onShouldStartLoadWithRequestCallback,
      // casting cause it's in the default props
      originWhitelist as ReadonlyArray<string>,
      onShouldStartLoadWithRequestProp,
    );

    const decelerationRate = processDecelerationRate(decelerationRateProp);

    let NativeWebView = nativeConfig.component as typeof NativeWebViewIOS;

    NativeWebView = NativeWebView || RNCWKWebView;

    const webView = (
      <NativeWebView
        key="webViewKey"
        {...otherProps}
        decelerationRate={decelerationRate}
        messagingEnabled={typeof onMessage === 'function'}
        onLoadingError={this.onLoadingError}
        onLoadingFinish={this.onLoadingFinish}
        onLoadingProgress={this.onLoadingProgress}
        onLoadingStart={this.onLoadingStart}
        onMessage={this.onMessage}
        onScroll={this.props.onScroll}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        ref={this.webViewRef}
        // TODO: find a better way to type this.
        source={resolveAssetSource(this.props.source as ImageSourcePropType)}
        style={webViewStyles}
        {...nativeConfig.props}
      />
    );

    return (
      <View style={styles.container}>
        {webView}
        {otherView}
      </View>
    );
  }
}

export default WebView;
