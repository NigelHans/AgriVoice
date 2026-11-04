/**
 * Card — the standard surface (a base Surface), kept so existing screens need no changes.
 */
import React from "react";
import type { ViewProps } from "react-native";
import Surface from "./Surface";

export default function Card(props: ViewProps) {
  return <Surface variant="base" {...props} />;
}
