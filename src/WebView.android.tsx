import React from 'react';

import {
  Image,
  requireNativeComponent,
  UIManager as NotTypedUIManager,
  View,
  NativeModules,
  ImageSourcePropType,
  findNodeHandle,
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
  AndroidWebViewProps,
  NativeWebViewAndroid,
  State,
  CustomUIManager,
  JsAlertEvent,
} from './WebViewTypes';

import styles from './WebView.styles';

const UIManager = NotTypedUIManager as CustomUIManager;

const RNCWebView = requireNativeComponent(
  'RNCWebView',
) as typeof NativeWebViewAndroid;
const { resolveAssetSource } = Image;

/**
 * Renders a native WebView.
 */
class WebView extends React.Component<AndroidWebViewProps, State> {
  static defaultProps = {
    overScrollMode: 'always',
    javaScriptEnabled: true,
    thirdPartyCookiesEnabled: true,
    scalesPageToFit: true,
    allowsFullscreenVideo: false,
    allowFileAccess: false,
    saveFormDataDisabled: false,
    cacheEnabled: true,
    androidHardwareAccelerationDisabled: false,
    originWhitelist: defaultOriginWhitelist,
  };

  static isFileUploadSupported = async () => {
    // native implementation should return "true" only for Android 5+
    return NativeModules.RNCWebView.isFileUploadSupported();
  };

  state: State = {
    viewState: this.props.startInLoadingState ? 'LOADING' : 'IDLE',
    lastErrorEvent: null,
  };

  webViewRef = React.createRef<NativeWebViewAndroid>();

  getCommands = () => getViewManagerConfig('RNCWebView').Commands;

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

  reload = () => {
    this.setState({
      viewState: 'LOADING',
    });
    const h = this.getWebViewHandle();
    if (h) {
      UIManager.dispatchViewManagerCommand(
        this.getWebViewHandle(),
        this.getCommands().reload,
        null,
      );
    }
  };

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

  onJsAlert = (event: JsAlertEvent) => {
    const { onJsAlert } = this.props;
    if (onJsAlert) {
      onJsAlert(event);
    }
  };

  onLoadingError = (event: WebViewErrorEvent) => {
    event.persist(); // persist this event because we need to store it
    const { onError, onLoadEnd } = this.props;
    if (onError) {
      onError(event);
    }
    if (onLoadEnd) {
      onLoadEnd(event);
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
    url: string,
  ) => {
    if (shouldStart) {
      const h = this.getWebViewHandle();
      if (h) {
        UIManager.dispatchViewManagerCommand(
          this.getWebViewHandle(),
          this.getCommands().loadUrl,
          [String(url)],
        );
      }
    }
  };
  
  onReceivedSslError = async (event: WebViewErrorEvent) => {
    let shouldProceed = false;
    if (this.props.onReceivedSslError) {
      shouldProceed = await this.props.onReceivedSslError(event);
    }
    const handle = this.getWebViewHandle();
    if (!handle) return;
    UIManager.dispatchViewManagerCommand(
      handle,
      this.getCommands().resolveSslError,
      [Boolean(shouldProceed)]
    );
  };

  render() {
    const {
      onMessage,
      onShouldStartLoadWithRequest: onShouldStartLoadWithRequestProp,
      originWhitelist,
      renderError,
      renderLoading,
      source,
      style,
      nativeConfig = {},
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

    if (source && 'method' in source) {
      if (source.method === 'POST' && source.headers) {
        console.warn(
          'WebView: `source.headers` is not supported when using POST.',
        );
      } else if (source.method === 'GET' && source.body) {
        console.warn('WebView: `source.body` is not supported when using GET.');
      }
    }

    const NativeWebView
      = (nativeConfig.component as typeof NativeWebViewAndroid) || RNCWebView;

    const onShouldStartLoadWithRequest = createOnShouldStartLoadWithRequest(
      this.onShouldStartLoadWithRequestCallback,
      // casting cause it's in the default props
      originWhitelist as ReadonlyArray<string>,
      onShouldStartLoadWithRequestProp,
    );

    const webView = (
      <NativeWebView
        key="webViewKey"
        {...otherProps}
        messagingEnabled={typeof onMessage === 'function'}
        onLoadingError={this.onLoadingError}
        onLoadingFinish={this.onLoadingFinish}
        onLoadingProgress={this.onLoadingProgress}
        onLoadingStart={this.onLoadingStart}
        onMessage={this.onMessage}
        onReceivedSslError={this.onReceivedSslError}
        onJsAlert={this.onJsAlert}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        ref={this.webViewRef}
        // TODO: find a better way to type this.
        source={resolveAssetSource(source as ImageSourcePropType)}
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
