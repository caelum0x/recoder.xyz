declare module 'react-native-uitextview' {
  import * as React from 'react';
  import type { TextProps } from 'react-native';

  export interface UITextViewProps extends TextProps {
    uiTextView?: boolean;
    children?: React.ReactNode;
  }

  export const UITextView: React.ForwardRefExoticComponent<
    UITextViewProps & React.RefAttributes<any>
  >;
}
