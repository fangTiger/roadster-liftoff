import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Cuer } from 'cuer';

test('第三方钱包二维码组件能渲染 WalletConnect 配对地址', () => {
  const uri = `wc:${'a'.repeat(64)}@2?relay-protocol=irn&symKey=${'b'.repeat(64)}`;
  const markup = renderToStaticMarkup(createElement(Cuer.Root, { value: uri }, createElement(Cuer.Cells)));
  assert.match(markup, /<svg/);
  assert.match(markup, /<path|<rect/);
});
