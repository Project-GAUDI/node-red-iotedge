# Node-RED-IoTEdge Release Notes

## 6.0.1

* GAUDIコンテナのログ出力のポリシー変更対応
  * 一部ログのログレベルを調整
    * info→error 8件
    * info→trace 9件
  * ログの追加
    * (ModuleInput)受信メッセージ内容(trace)
* 個別パイプライン修正
  * AzureSDKバージョン選択可能化
  * vmImageのバージョン変更(20.04→22.04)
* 不具合修正
  * IoTEdgeノードの接続タイムアウト値をSDKに合わせるように変更
* 送信メッセージにcontentTypeとcontentEncodingを付与するように変更
* ドキュメント更新

## 2.1.0

* Amqp時のみ発生するcomplete処理不具合対応
  * complete処理タイミングをinput名判定後に変更
  * ModuleInputデプロイ時input名の重複チェックを追加
* $.cmid・$.cdidの重複回避対応
* 送受信リトライ対象エラーから以下を除外
  * MessageTooLargeError
  * DeviceMessageLockLostError

## 2.0.0

* プロトコルをMqttからAmqpに変更

## 1.2.1

* ネットワークが一定期間切断された後、ネットワークが復旧してもModuleInputにおいてメッセージが受信できなくなる不具合修正
  * タイムアウト時間デフォルト値変更(1時間)・カスタム化対応
  * 通信エラーフィルターデフォルト値変更(すべて再接続判定)・カスタム化対応
  * 通信切断時ログ出力対応
* 格納先Artifactsをビルドの種類(手動/Tag)によって変更

## 1.2.0

* ModuleInputを再作成または更新し「変更したフロー」「変更したノード」でデプロイした際にメッセージが多重に受信する不具合修正

## 1.1.1

* Module Outputノードに文字列以外のプロパティを含むメッセージを入力するとエラー発生対応
* ModuleInputで付与したプロパティ($.cdid, $.cmid)をModuleOutput処理時に削除する処理を再対応（修正不具合対応）

## 1.1.0

* ModuleOutputにプロパティの編集処理を追加
* ModuleOutputにiothubトピックメッセージサイズの上限チェック処理を追加
* ModuleInputで付与したプロパティ($.cdid, $.cmid)をModuleOutput処理時に削除する処理を追加

## 1.0.0

* 新規作成
