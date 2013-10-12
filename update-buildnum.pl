#!/usr/bin/perl -pi~
s/("version": "\d+\.\d+.)(\d+)/sprintf("%s%04d",$1,$2+1)/e;
